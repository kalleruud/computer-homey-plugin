import type Homey from 'homey'
import type { ComputerDriverSettings } from '../types.js'
import { runSshCommandOnHost } from './ssh-exec.js'

// Each native query emits: percentage|remaining|full|unit, one system battery per line.
const commands = {
  linux: `for b in /sys/class/power_supply/*; do [ "$(cat "$b/type" 2>/dev/null)" = Battery ] || continue; [ "$(cat "$b/scope" 2>/dev/null)" = Device ] && continue; [ "$(cat "$b/present" 2>/dev/null)" = 0 ] && continue; p=$(cat "$b/capacity" 2>/dev/null); if [ -r "$b/energy_now" ] && [ -r "$b/energy_full" ]; then r=$(cat "$b/energy_now"); f=$(cat "$b/energy_full"); u=energy; else r=$(cat "$b/charge_now" 2>/dev/null); f=$(cat "$b/charge_full" 2>/dev/null); u=charge; fi; printf '%s|%s|%s|%s\\n' "$p" "$r" "$f" "$u"; done`,
  macos: `ioreg -r -c AppleSmartBattery | awk '/"CurrentCapacity" =/ {c=$NF} /"MaxCapacity" =/ {f=$NF} /"AppleRawCurrentCapacity" =/ {r=$NF} /"AppleRawMaxCapacity" =/ {m=$NF} END {if (f>0) printf "%s|%s|%s|raw\\n",100*c/f,r,m}'`,
  windows: `powershell.exe -NoProfile -NonInteractive -Command "$s=@(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction Stop | Where-Object Active); $f=@(Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity -ErrorAction Stop); foreach($b in $s){$c=$f | Where-Object InstanceName -eq $b.InstanceName; if($c.FullChargedCapacity -gt 0){'{0}|{1}|{2}|mWh' -f (100.0*$b.RemainingCapacity/$c.FullChargedCapacity),$b.RemainingCapacity,$c.FullChargedCapacity}}"`,
}

const readings = new WeakMap<Homey.Device, number | null>()
const generations = new WeakMap<Homey.Device, object>()

function parseBattery(output: string): number | null {
  const rows = output
    .trim()
    .split(/\r?\n/)
    .map(line => {
      const [p, r, f, unit] = line.trim().split('|')
      const number = (value: string | undefined) =>
        value?.trim() ? Number(value) : NaN
      return {
        percentage: number(p),
        remaining: number(r),
        full: number(f),
        unit,
      }
    })
    .filter(
      row =>
        Number.isFinite(row.percentage) &&
        row.percentage >= 0 &&
        row.percentage <= 100
    )
  if (!rows.length) return null
  const weighted = rows.every(
    row =>
      ['energy', 'mWh'].includes(row.unit ?? '') &&
      row.unit === rows[0]?.unit &&
      Number.isFinite(row.remaining) &&
      Number.isFinite(row.full) &&
      row.full > 0 &&
      row.remaining >= 0 &&
      row.remaining <= row.full
  )
  const value = weighted
    ? (100 * rows.reduce((sum, row) => sum + row.remaining, 0)) /
      rows.reduce((sum, row) => sum + row.full, 0)
    : Math.min(...rows.map(row => row.percentage))
  return Math.round(value * 100) / 100
}

export async function resetBattery(device: Homey.Device) {
  generations.set(device, {})
  readings.set(device, null)
  if (device.hasCapability('measure_battery'))
    await device.setCapabilityValue('measure_battery', null)
}

export async function pollBattery(
  device: Homey.Device,
  settings: ComputerDriverSettings,
  online: boolean
) {
  if (!settings.batteryMonitoring) return
  const generation = generations.get(device)
  let value: number | null = null
  if (
    online &&
    settings.sshUsername &&
    (settings.sshPrivateKey || settings.sshPassword)
  ) {
    for (const host of settings.ipAddresses) {
      try {
        value = parseBattery(
          await runSshCommandOnHost(
            settings,
            host,
            commands[settings.targetOs],
            { timeoutMs: 10_000, maxOutputBytes: 262144, requireExitCode: true }
          )
        )
        break
      } catch {
        /* Try the next configured host. */
      }
    }
  }
  if (
    generations.get(device) !== generation ||
    !device.hasCapability('measure_battery')
  )
    return
  const previous = readings.get(device) ?? null
  readings.set(device, value)
  try {
    await device.setCapabilityValue('measure_battery', value)
    if (value !== null) {
      for (const direction of ['below', 'above'] as const) {
        await device.homey.flow
          .getDeviceTriggerCard(`computer_battery_${direction}`)
          .trigger(device, {}, { value, previous })
      }
    }
  } catch (error) {
    device.error('Failed to update battery telemetry', error)
  }
}

export function registerBatteryFlows(homey: Homey.Driver['homey']) {
  for (const direction of ['below', 'above'] as const) {
    const matches = (value: number, threshold: number) =>
      direction === 'below' ? value < threshold : value > threshold
    homey.flow
      .getDeviceTriggerCard(`computer_battery_${direction}`)
      .registerRunListener(
        async (args, state) =>
          Number.isFinite(args.threshold) &&
          matches(state.value, args.threshold) &&
          (state.previous === null || !matches(state.previous, args.threshold))
      )
    homey.flow
      .getConditionCard(`computer_battery_${direction}`)
      .registerRunListener(async args => {
        const value = readings.get(args.device)
        if (value == null || !args.device.hasCapability('measure_battery'))
          throw new Error('Battery reading is unknown')
        return Number.isFinite(args.threshold) && matches(value, args.threshold)
      })
  }
}

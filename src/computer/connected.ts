import type Homey from 'homey'
import { execFile } from 'node:child_process'
import net from 'node:net'
import { POLL_TIMEOUT_MS, SSH_UNAVAILABLE_WARNING_KEY } from '../constants.js'
import { debugLog, getDeviceState } from '../lib.js'
import { ComputerDriverSettings } from '../types.js'
import {
  getComputerSettings,
  getPollIntervalMs,
  getProbeValidationError,
} from './settings.js'
import { getUptimeMinutes } from './uptime.js'

type ComputerConnectionState = {
  isOnline: boolean
  warning?: string
}

export function stopPolling(device: Homey.Device) {
  const state = getDeviceState(device)

  if (state.pollIntervalTimer) {
    device.homey.clearInterval(state.pollIntervalTimer)
    state.pollIntervalTimer = undefined
  }

  if (state.refreshTimer) {
    device.homey.clearTimeout(state.refreshTimer)
    state.refreshTimer = undefined
  }
}

export async function startPolling(device: Homey.Device) {
  stopPolling(device)

  const state = getDeviceState(device)
  const settings = getComputerSettings(device.getSettings())
  const intervalMs = getPollIntervalMs(settings)

  debugLog(device, `Starting computer status polling every ${intervalMs} ms`)

  state.pollIntervalTimer = device.homey.setInterval(() => {
    void refreshComputerState(device)
  }, intervalMs)

  debugLog(device, 'Running initial poll immediately after startup')
  await refreshComputerState(device)
}

async function pollComputerConnectionState(
  settings: ComputerDriverSettings,
  onMissingPingCommand: () => void
): Promise<ComputerConnectionState> {
  const validationError = getProbeValidationError(settings)
  if (validationError) {
    return {
      isOnline: false,
      warning: validationError,
    }
  }

  const [sshResults, pingResults] = await Promise.all([
    Promise.all(
      settings.ipAddresses.map(ipAddress =>
        probeTcpPort(ipAddress, settings.sshPort)
      )
    ),
    Promise.all(
      settings.ipAddresses.map(ipAddress =>
        probePing(ipAddress, onMissingPingCommand)
      )
    ),
  ])

  if (sshResults.includes(true)) {
    return {
      isOnline: true,
    }
  }

  if (pingResults.includes(true)) {
    return {
      isOnline: true,
      warning: SSH_UNAVAILABLE_WARNING_KEY,
    }
  }

  return {
    isOnline: false,
  }
}

async function refreshComputerState(device: Homey.Device): Promise<boolean> {
  const state = getDeviceState(device)
  if (state.pollInFlight) {
    debugLog(device, 'Skipping poll because another poll is already running')
    return device.getCapabilityValue('connected') === true
  }

  state.pollInFlight = true

  try {
    const settings = getComputerSettings(device.getSettings())

    debugLog(
      device,
      `Polling computer status for ${settings.ipAddresses.join(', ') || '<missing ip>'} on SSH port ${settings.sshPort.toString()}`
    )

    const connectionState = await pollComputerConnectionState(settings, () => {
      if (state.pingCommandMissingLogged) {
        return
      }

      state.pingCommandMissingLogged = true
      device.error('Ping command is not available for fallback status checks')
    })

    return await applyConnectionState(device, connectionState)
  } catch (error) {
    device.error('Failed to poll the computer status', error)
    return device.getCapabilityValue('connected') === true
  } finally {
    state.pollInFlight = false
  }
}

async function applyConnectionState(
  device: Homey.Device,
  connectionState: Awaited<ReturnType<typeof pollComputerConnectionState>>
): Promise<boolean> {
  const { isOnline, warning } = connectionState
  const previousConnected = device.getCapabilityValue('connected')
  const previousUptime = device.getCapabilityValue('uptime')

  debugLog(
    device,
    `Poll result: online=${isOnline.toString()} warning=${warning ?? 'none'}`
  )

  if (warning) {
    await device.setWarning(device.homey.__(warning))
  } else {
    await device.unsetWarning()
  }

  const uptimeMinutes = getUptimeMinutes(device, isOnline)
  const state = getDeviceState(device)

  if (previousConnected !== isOnline) {
    await device.setCapabilityValue('connected', isOnline)
  }

  if (previousUptime !== uptimeMinutes) {
    await device.setCapabilityValue('uptime', uptimeMinutes)
  }

  if (state.hasCompletedInitialPoll) {
    const driver = device.driver as Homey.Driver & {
      triggerComputerTurnedOn(device: Homey.Device): void
      triggerComputerTurnedOff(device: Homey.Device): void
      triggerComputerUptimeChanged(device: Homey.Device, uptime: number): void
    }

    if (previousConnected !== isOnline) {
      if (isOnline) {
        driver.triggerComputerTurnedOn(device)
      } else {
        driver.triggerComputerTurnedOff(device)
      }
    }

    if (previousUptime !== uptimeMinutes) {
      driver.triggerComputerUptimeChanged(device, uptimeMinutes)
    }
  }

  state.hasCompletedInitialPoll = true

  debugLog(
    device,
    `Applied capability state: connected=${isOnline.toString()} uptime=${uptimeMinutes?.toString() ?? '-'}`
  )

  return isOnline
}

async function probeTcpPort(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let settled = false

    const finish = (isOnline: boolean) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(isOnline)
    }

    socket.setTimeout(POLL_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function probePing(
  host: string,
  onMissingPingCommand: () => void
): Promise<boolean> {
  return new Promise(resolve => {
    execFile('ping', ['-c', '1', '-W', '1', host], error => {
      if (!error) {
        resolve(true)
        return
      }

      if ('code' in error && error.code === 'ENOENT') {
        onMissingPingCommand()
      }

      resolve(false)
    })
  })
}

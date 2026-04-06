import Homey from 'homey'

import { IS_DEBUG, STARTUP_REFRESH_DELAY_MS } from '../constants.js'
import { pollComputerConnectionState } from './connected.js'
import { getComputerSettings, getPollIntervalMs } from './settings.js'

type ComputerDeviceState = {
  pollInFlight: boolean
  pollIntervalTimer?: ReturnType<typeof setInterval>
  refreshTimer?: ReturnType<typeof setTimeout>
  onlineSinceAt?: number
  pingCommandMissingLogged: boolean
}

const REQUIRED_CAPABILITIES = ['connected', 'poweron', 'poweroff', 'uptime']
const deviceStates = new WeakMap<Homey.Device, ComputerDeviceState>()

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

export async function ensureRequiredCapabilities(device: Homey.Device) {
  for (const capabilityId of REQUIRED_CAPABILITIES) {
    if (!device.hasCapability(capabilityId)) {
      await device.addCapability(capabilityId)
    }
  }
}

export async function startPolling(device: Homey.Device) {
  stopPolling(device)

  const state = getDeviceState(device)
  const settings = getComputerSettings(device.getSettings())
  const intervalMs = getPollIntervalMs(settings)

  debugPollLog(
    device,
    `Starting computer status polling every ${intervalMs} ms`
  )

  state.pollIntervalTimer = device.homey.setInterval(() => {
    debugPollLog(device, 'Polling timer fired')
    void refreshComputerState(device)
  }, intervalMs)

  debugPollLog(device, 'Running initial poll immediately after startup')
  await refreshComputerState(device)
}

export function scheduleRefresh(device: Homey.Device) {
  const state = getDeviceState(device)

  if (state.refreshTimer) {
    device.homey.clearTimeout(state.refreshTimer)
  }

  debugPollLog(
    device,
    `Scheduling follow-up poll in ${STARTUP_REFRESH_DELAY_MS} ms`
  )

  state.refreshTimer = device.homey.setTimeout(() => {
    getDeviceState(device).refreshTimer = undefined
    debugPollLog(device, 'Scheduled follow-up poll fired')
    void refreshComputerState(device)
  }, STARTUP_REFRESH_DELAY_MS)
}

async function refreshComputerState(device: Homey.Device): Promise<boolean> {
  const state = getDeviceState(device)
  if (state.pollInFlight) {
    debugPollLog(
      device,
      'Skipping poll because another poll is already running'
    )
    return device.getCapabilityValue('connected') === true
  }

  state.pollInFlight = true

  try {
    const settings = getComputerSettings(device.getSettings())

    debugPollLog(
      device,
      `Polling computer status for ${settings.ipAddress || '<missing ip>'} on SSH port ${settings.sshPort.toString()}`
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

  debugPollLog(
    device,
    `Poll result: online=${isOnline.toString()} warning=${warning ?? 'none'}`
  )

  if (warning) {
    await device.setWarning(warning)
  } else {
    await device.unsetWarning()
  }

  const uptimeSeconds = getUptimeSeconds(device, isOnline)

  if (
    device.hasCapability('connected') &&
    device.getCapabilityValue('connected') !== isOnline
  ) {
    await device.setCapabilityValue('connected', isOnline)
  }

  if (
    device.hasCapability('uptime') &&
    device.getCapabilityValue('uptime') !== uptimeSeconds
  ) {
    await device.setCapabilityValue('uptime', uptimeSeconds)
  }

  debugPollLog(
    device,
    `Applied capability state: connected=${isOnline.toString()} uptime=${uptimeSeconds.toString()}`
  )

  return isOnline
}

function getUptimeSeconds(device: Homey.Device, isOnline: boolean): number {
  const state = getDeviceState(device)
  const now = Date.now()

  if (isOnline) {
    state.onlineSinceAt ??= now
  } else {
    state.onlineSinceAt = undefined
  }

  if (state.onlineSinceAt === undefined) {
    return 0
  }

  return Math.max(0, Math.floor((now - state.onlineSinceAt) / 1000))
}

function getDeviceState(device: Homey.Device): ComputerDeviceState {
  const existingState = deviceStates.get(device)
  if (existingState) {
    return existingState
  }

  const nextState: ComputerDeviceState = {
    pollInFlight: false,
    pingCommandMissingLogged: false,
  }

  deviceStates.set(device, nextState)

  return nextState
}

function debugPollLog(device: Homey.Device, message: string) {
  if (!IS_DEBUG) {
    return
  }

  device.log(message)
}

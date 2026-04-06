import Homey from 'homey'
import {
  MIN_SHUTDOWN_TIMEOUT_SECONDS,
  SHUTDOWN_CONFIRM_POLL_INTERVAL_MS,
  SHUTDOWN_REFRESH_DELAY_MS,
  STARTUP_REFRESH_DELAY_MS,
} from '../constants'
import {
  assertCanShutdown,
  assertCanWake,
  getProbeValidationError,
} from './device-validation'
import { executeShutdown, sendWakeOnLan } from './power'
import { probePing, probeTcpPort } from './probes'
import { getComputerSettings, getPollIntervalMs } from './settings'
import type { DeviceSettingsEvent } from './types'

type DeviceState = {
  pollIntervalTimer?: NodeJS.Timeout
  refreshTimer?: NodeJS.Timeout
  pollInFlight: boolean
}

const deviceStates = new WeakMap<Homey.Device, DeviceState>()

export async function onInit(device: Homey.Device) {
  device.log('Computer device has been initialized')
  if (!device.hasCapability('alarm_connectivity')) {
    await device.addCapability('alarm_connectivity')
  }

  device.registerCapabilityListener('onoff', async value => {
    if (value) {
      await startComputer(device)
      return
    }

    await shutdownComputer(device)
  })

  startPolling(device)
}

export async function onSettings(
  device: Homey.Device,
  { changedKeys }: DeviceSettingsEvent
) {
  device.log('Computer settings changed', changedKeys)
  startPolling(device)
  await pollOnlineStatus(device)
  return translate(device, 'messages.settings_updated')
}

export async function startComputer(device: Homey.Device) {
  const settings = getSettings(device)
  assertCanWake(settings, key => translate(device, key))
  await sendWakeOnLan(settings, getPowerOptions(device))
  scheduleRefresh(device, STARTUP_REFRESH_DELAY_MS)
}

export async function shutdownComputer(device: Homey.Device) {
  const settings = getSettings(device)
  assertCanShutdown(settings, key => translate(device, key))
  await executeShutdown(settings, getPowerOptions(device))
  await waitForOfflineConfirmation(device, settings.shutdownTimeoutSeconds)
  scheduleRefresh(device, SHUTDOWN_REFRESH_DELAY_MS)
}

function getDeviceState(device: Homey.Device): DeviceState {
  const existingState = deviceStates.get(device)

  if (existingState) {
    return existingState
  }

  const nextState: DeviceState = {
    pollInFlight: false,
  }

  deviceStates.set(device, nextState)
  return nextState
}

function getSettings(device: Homey.Device) {
  return getComputerSettings(device.getSettings())
}

function translate(device: Homey.Device, key: string) {
  return device.homey.__(key)
}

function getPowerOptions(device: Homey.Device) {
  return {
    logError: (message: string, error: unknown) => device.error(message, error),
    translate: (key: string) => translate(device, key),
  }
}

function startPolling(device: Homey.Device) {
  stopPolling(device)

  const state = getDeviceState(device)
  state.pollIntervalTimer = device.homey.setInterval(
    () => {
      void pollOnlineStatus(device)
    },
    getPollIntervalMs(getSettings(device))
  )

  void pollOnlineStatus(device)
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

function scheduleRefresh(device: Homey.Device, delayMs: number) {
  const state = getDeviceState(device)

  if (state.refreshTimer) {
    device.homey.clearTimeout(state.refreshTimer)
  }

  state.refreshTimer = device.homey.setTimeout(() => {
    const currentState = getDeviceState(device)
    currentState.refreshTimer = undefined
    void pollOnlineStatus(device)
  }, delayMs)
}

function waitForTimeout(device: Homey.Device, delayMs: number) {
  return new Promise<void>(resolve => {
    device.homey.setTimeout(resolve, delayMs)
  })
}

async function waitForOfflineConfirmation(
  device: Homey.Device,
  timeoutSeconds: number
) {
  const timeoutMs =
    Math.max(MIN_SHUTDOWN_TIMEOUT_SECONDS, timeoutSeconds) * 1000
  const timeoutAt = Date.now() + timeoutMs

  while (Date.now() <= timeoutAt) {
    const isOnline = await pollOnlineStatus(device)
    if (!isOnline) {
      return
    }

    await waitForTimeout(device, SHUTDOWN_CONFIRM_POLL_INTERVAL_MS)
  }

  throw new Error(translate(device, 'errors.shutdown_timeout'))
}

async function applyPollResult(
  device: Homey.Device,
  {
    isOnline,
    isConnectivityAlarmActive,
    warning,
  }: {
    isOnline: boolean
    isConnectivityAlarmActive: boolean
    warning?: string
  }
) {
  if (warning) {
    await device.setWarning(warning)
  } else {
    await device.unsetWarning()
  }

  if (
    device.hasCapability('alarm_connectivity') &&
    device.getCapabilityValue('alarm_connectivity') !==
      isConnectivityAlarmActive
  ) {
    await device.setCapabilityValue(
      'alarm_connectivity',
      isConnectivityAlarmActive
    )
  }

  if (device.getCapabilityValue('onoff') !== isOnline) {
    await device.setCapabilityValue('onoff', isOnline)
  }

  return isOnline
}

async function pollOnlineStatus(device: Homey.Device) {
  const state = getDeviceState(device)

  if (state.pollInFlight) {
    return device.getCapabilityValue('onoff') === true
  }

  state.pollInFlight = true

  try {
    const settings = getSettings(device)
    const validationError = getProbeValidationError(settings, key =>
      translate(device, key)
    )

    if (validationError) {
      return applyPollResult(device, {
        isOnline: false,
        isConnectivityAlarmActive: false,
        warning: validationError,
      })
    }

    const isSshReachable = await probeTcpPort(
      settings.ipAddress,
      settings.sshPort
    )

    if (isSshReachable) {
      return applyPollResult(device, {
        isOnline: true,
        isConnectivityAlarmActive: false,
      })
    }

    const isPingReachable = await probePing(settings.ipAddress, () => {
      device.error('Ping command is not available for fallback status checks')
    })

    if (isPingReachable) {
      return applyPollResult(device, {
        isOnline: true,
        isConnectivityAlarmActive: true,
        warning: translate(device, 'warnings.ssh_unavailable'),
      })
    }

    return applyPollResult(device, {
      isOnline: false,
      isConnectivityAlarmActive: false,
    })
  } catch (error) {
    device.error('Failed to poll the computer status', error)
    return device.getCapabilityValue('onoff') === true
  } finally {
    state.pollInFlight = false
  }
}

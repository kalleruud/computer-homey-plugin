import Homey from 'homey'

import {
  SHUTDOWN_REFRESH_DELAY_MS,
  STARTUP_REFRESH_DELAY_MS,
} from '../constants.js'
import {
  assertCanShutdown,
  assertCanWake,
  getProbeValidationError,
} from './device-validation.mjs'
import { executeShutdown, sendWakeOnLan } from './power.mjs'
import { probePing, probeTcpPort } from './probes.mjs'
import { getComputerSettings, getPollIntervalMs } from './settings.mjs'
import type { DeviceSettingsEvent } from './types.mjs'

type DeviceState = {
  pollIntervalTimer?: NodeJS.Timeout
  refreshTimer?: NodeJS.Timeout
  pollInFlight: boolean
}

const deviceStates = new WeakMap<Homey.Device, DeviceState>()

export async function onInit(device: Homey.Device) {
  device.log('Computer device has been initialized')
  if (!device.hasCapability('alarm_ssh')) {
    await device.addCapability('alarm_ssh')
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

async function applyPollResult(
  device: Homey.Device,
  {
    isOnline,
    isSshAlarmActive,
    warning,
  }: {
    isOnline: boolean
    isSshAlarmActive: boolean
    warning?: string
  }
) {
  if (warning) {
    await device.setWarning(warning)
  } else {
    await device.unsetWarning()
  }

  if (
    device.hasCapability('alarm_ssh') &&
    device.getCapabilityValue('alarm_ssh') !== isSshAlarmActive
  ) {
    await device.setCapabilityValue('alarm_ssh', isSshAlarmActive)
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
        isSshAlarmActive: true,
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
        isSshAlarmActive: false,
      })
    }

    const isPingReachable = await probePing(settings.ipAddress, () => {
      device.error('Ping command is not available for fallback status checks')
    })

    if (isPingReachable) {
      return applyPollResult(device, {
        isOnline: true,
        isSshAlarmActive: true,
        warning: translate(device, 'warnings.ssh_unavailable'),
      })
    }

    return applyPollResult(device, {
      isOnline: false,
      isSshAlarmActive: true,
    })
  } catch (error) {
    device.error('Failed to poll the computer status', error)
    return device.getCapabilityValue('onoff') === true
  } finally {
    state.pollInFlight = false
  }
}

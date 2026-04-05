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
  await ensureAlarmSshCapability(device)
  device.registerCapabilityListener('onoff', value =>
    handleOnOffCapability(device, value)
  )
  startPolling(device)
}

export async function onAdded(device: Homey.Device) {
  device.log('Computer device has been added')
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

export async function onRenamed(device: Homey.Device, name: string) {
  device.log('Computer device was renamed to', name)
}

export async function onDeleted(device: Homey.Device) {
  stopPolling(device)
  device.log('Computer device has been deleted')
}

export async function onUninit(device: Homey.Device) {
  stopPolling(device)
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

async function handleOnOffCapability(device: Homey.Device, value: boolean) {
  if (value) {
    await startComputer(device)
    return
  }

  await shutdownComputer(device)
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

function stopPolling(device: Homey.Device) {
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
      await device.setWarning(validationError)
      await syncSshAlarmState(device, true)
      await syncOnOffState(device, false)
      return false
    }

    const isSshReachable = await probeTcpPort(
      settings.ipAddress,
      settings.sshPort
    )

    if (isSshReachable) {
      await device.unsetWarning()
      await syncSshAlarmState(device, false)
      device.log(
        `Poll connection status for ${settings.ipAddress}:${settings.sshPort}: online (ssh reachable)`
      )
      await syncOnOffState(device, true)
      return true
    }

    const isPingReachable = await probePing(settings.ipAddress, () => {
      device.error('Ping command is not available for fallback status checks')
    })

    if (isPingReachable) {
      await device.setWarning(translate(device, 'warnings.ssh_unavailable'))
      await syncSshAlarmState(device, true)
      device.log(
        `Poll connection status for ${settings.ipAddress}:${settings.sshPort}: online (ping reachable, ssh unavailable)`
      )
      await syncOnOffState(device, true)
      return true
    }

    await device.unsetWarning()
    await syncSshAlarmState(device, true)
    device.log(
      `Poll connection status for ${settings.ipAddress}:${settings.sshPort}: offline`
    )
    await syncOnOffState(device, false)
    return false
  } catch (error) {
    device.error('Failed to poll the computer status', error)
    return device.getCapabilityValue('onoff') === true
  } finally {
    state.pollInFlight = false
  }
}

async function syncOnOffState(device: Homey.Device, isOnline: boolean) {
  if (device.getCapabilityValue('onoff') !== isOnline) {
    await device.setCapabilityValue('onoff', isOnline)
  }
}

async function syncSshAlarmState(device: Homey.Device, isUnreachable: boolean) {
  if (!device.hasCapability('alarm_ssh')) {
    return
  }

  if (device.getCapabilityValue('alarm_ssh') !== isUnreachable) {
    await device.setCapabilityValue('alarm_ssh', isUnreachable)
  }
}

async function ensureAlarmSshCapability(device: Homey.Device) {
  if (!device.hasCapability('alarm_ssh')) {
    await device.addCapability('alarm_ssh')
  }
}

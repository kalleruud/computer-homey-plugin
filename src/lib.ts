import type Homey from 'homey'
import { getComputerSettings } from './computer/settings.js'
import { IS_DEBUG, REQUIRED_CAPABILITIES } from './constants.js'

type ComputerDeviceState = {
  pollInFlight: boolean
  pollIntervalTimer?: ReturnType<typeof setInterval>
  refreshTimer?: ReturnType<typeof setTimeout>
  onlineSinceAt?: number
  pingCommandMissingLogged: boolean
  hasCompletedInitialPoll: boolean
}

const deviceStates = new WeakMap<Homey.Device, ComputerDeviceState>()

export function getDeviceState(device: Homey.Device): ComputerDeviceState {
  const existingState = deviceStates.get(device)
  if (existingState) {
    return existingState
  }

  const nextState: ComputerDeviceState = {
    pollInFlight: false,
    hasCompletedInitialPoll: false,
    pingCommandMissingLogged: false,
  }

  deviceStates.set(device, nextState)

  return nextState
}

export async function ensureCapabilities(
  device: Homey.Device,
  settings = device.getSettings()
) {
  const capabilities: string[] = [...REQUIRED_CAPABILITIES]
  if (getComputerSettings(settings).batteryMonitoring)
    capabilities.push('measure_battery')
  for (const capability of capabilities) {
    if (!device.hasCapability(capability)) {
      await device.addCapability(capability)
    }
  }

  for (const capability of device.getCapabilities()) {
    if (!capabilities.includes(capability)) {
      await device.removeCapability(capability)
      device.log(`Removed unused capability: ${capability}`)
    }
  }
}

export function debugLog(device: Homey.Device, message: string) {
  if (IS_DEBUG) {
    device.log(message)
  }
}

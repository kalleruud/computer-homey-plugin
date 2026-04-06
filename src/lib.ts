import type Homey from 'homey'
import { IS_DEBUG, REQUIRED_CAPABILITIES } from './constants.js'
import type { Capability } from './types.js'

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

export async function ensureCapabilities(device: Homey.Device) {
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!device.hasCapability(capability)) {
      await device.addCapability(capability)
    }
  }

  for (const capability of device.getCapabilities() as Capability[]) {
    if (!REQUIRED_CAPABILITIES.includes(capability)) {
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

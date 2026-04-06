import type Homey from 'homey'
import { getDeviceState } from '../lib.js'

export function getUptimeMinutes(
  device: Homey.Device,
  isOnline: boolean
): number | undefined {
  const state = getDeviceState(device)
  const now = Date.now()

  if (isOnline) {
    state.onlineSinceAt ??= now
  } else {
    state.onlineSinceAt = undefined
  }

  if (state.onlineSinceAt === undefined) {
    return undefined
  }

  return Math.max(0, Math.floor((now - state.onlineSinceAt) / 60_000))
}

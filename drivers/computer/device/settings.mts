import { DEFAULTS, MIN_POLL_INTERVAL_SECONDS } from '../constants.js'
import {
  getNumber,
  getTargetOs,
  getTrimmedString,
  type ComputerSettings,
  type RawDeviceSettings,
} from './types.mjs'

export function getComputerSettings(
  settings: RawDeviceSettings
): ComputerSettings {
  return {
    ipAddress: getTrimmedString(settings.ip_address),
    macAddress: getTrimmedString(settings.mac_address),
    pollIntervalSeconds: getNumber(
      settings.poll_interval,
      DEFAULTS.POLL_INTERVAL_SECONDS
    ),
    targetOs: getTargetOs(settings.target_os),
    sshUsername: getTrimmedString(settings.ssh_username),
    sshPassword: getTrimmedString(settings.ssh_password),
    sshPort: getNumber(settings.ssh_port, DEFAULTS.SSH_PORT),
    wolBroadcastAddress:
      getTrimmedString(settings.wol_broadcast_address) ||
      DEFAULTS.WOL_BROADCAST_ADDRESS,
  }
}

export function getPollIntervalMs(settings: ComputerSettings) {
  const clampedSeconds = Math.max(
    MIN_POLL_INTERVAL_SECONDS,
    settings.pollIntervalSeconds
  )

  return clampedSeconds * 1000
}

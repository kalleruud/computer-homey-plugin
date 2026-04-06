import { DEFAULTS, MIN_POLL_INTERVAL_SECONDS } from '../constants'
import type { ComputerSettings, RawDeviceSettings } from './types'

export function getComputerSettings(
  settings: RawDeviceSettings
): ComputerSettings {
  return {
    ipAddress:
      typeof settings.ip_address === 'string' ? settings.ip_address.trim() : '',
    macAddress:
      typeof settings.mac_address === 'string'
        ? settings.mac_address.trim()
        : '',
    pollIntervalSeconds:
      typeof settings.poll_interval === 'number' &&
      Number.isFinite(settings.poll_interval)
        ? settings.poll_interval
        : DEFAULTS.POLL_INTERVAL_SECONDS,
    shutdownTimeoutSeconds:
      typeof settings.shutdown_timeout === 'number' &&
      Number.isFinite(settings.shutdown_timeout)
        ? settings.shutdown_timeout
        : DEFAULTS.SHUTDOWN_TIMEOUT_SECONDS,
    targetOs:
      settings.target_os === 'windows' ||
      settings.target_os === 'linux' ||
      settings.target_os === 'macos'
        ? settings.target_os
        : 'linux',
    sshUsername:
      typeof settings.ssh_username === 'string'
        ? settings.ssh_username.trim()
        : '',
    sshPassword:
      typeof settings.ssh_password === 'string'
        ? settings.ssh_password.trim()
        : '',
    sshPort:
      typeof settings.ssh_port === 'number' &&
      Number.isFinite(settings.ssh_port)
        ? settings.ssh_port
        : DEFAULTS.SSH_PORT,
    wolBroadcastAddress:
      (typeof settings.wol_broadcast_address === 'string'
        ? settings.wol_broadcast_address.trim()
        : '') || DEFAULTS.WOL_BROADCAST_ADDRESS,
  }
}

export function getPollIntervalMs(settings: ComputerSettings) {
  const clampedSeconds = Math.max(
    MIN_POLL_INTERVAL_SECONDS,
    settings.pollIntervalSeconds
  )

  return clampedSeconds * 1000
}

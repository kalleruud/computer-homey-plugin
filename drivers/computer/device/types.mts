import Homey from 'homey'

export type TargetOs = 'windows' | 'linux' | 'macos'

export type DeviceSettingsEvent = Parameters<
  typeof Homey.Device.prototype.onSettings
>[0]

export type RawDeviceSettings = ReturnType<Homey.Device['getSettings']>

type DeviceSettingValue = RawDeviceSettings[string]

export type ComputerSettings = {
  ipAddress: string
  macAddress: string
  pollIntervalSeconds: number
  targetOs: TargetOs
  sshUsername: string
  sshPassword: string
  sshPort: number
  wolBroadcastAddress: string
}

export type Translate = (key: string) => string

export function getTrimmedString(value: DeviceSettingValue) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getNumber(value: DeviceSettingValue, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function getTargetOs(value: DeviceSettingValue): TargetOs {
  if (value === 'windows' || value === 'linux' || value === 'macos') {
    return value
  }

  return 'linux'
}

import Homey from 'homey'

export type TargetOs = 'windows' | 'linux' | 'macos'

export type DeviceSettingsEvent = Parameters<
  typeof Homey.Device.prototype.onSettings
>[0]

export type RawDeviceSettings = ReturnType<Homey.Device['getSettings']>

export type ComputerSettings = {
  ipAddress: string
  macAddress: string
  pollIntervalSeconds: number
  targetOs: TargetOs
  sshHostFingerprint: string
  sshUsername: string
  sshPassword: string
  sshPort: number
  wolBroadcastAddress: string
}

export type Translate = (key: string) => string

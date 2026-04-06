import Homey from 'homey'

export type TargetOs = 'windows' | 'linux' | 'macos'

export type DeviceSettingsEvent = Parameters<
  typeof Homey.Device.prototype.onSettings
>[0]

export type ComputerDriverSettings = {
  ipAddress: string
  macAddress: string
  pollIntervalSeconds: number
  targetOs: TargetOs
  sshUsername: string
  sshPassword: string
  sshPort: number
  wolBroadcastAddress: string
}

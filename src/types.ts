import Homey from 'homey'
import { REQUIRED_CAPABILITIES } from './constants'

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

export type Capability = (typeof REQUIRED_CAPABILITIES)[number]

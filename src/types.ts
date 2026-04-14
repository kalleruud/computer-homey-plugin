import Homey from 'homey'
import { REQUIRED_CAPABILITIES } from './constants.js'

export type TargetOs = 'windows' | 'linux' | 'macos'

export type StartupMode = 'wol' | 'ssh'

export type DeviceSettingsEvent = Parameters<
  typeof Homey.Device.prototype.onSettings
>[0]

export type ComputerDriverSettings = {
  ipAddresses: string[]
  macAddresses: string[]
  pollIntervalSeconds: number
  startupMode: StartupMode
  customPowerOnCommand: string
  customShutdownCommand: string
  targetOs: TargetOs
  sshUsername: string
  sshPassword: string
  sshPort: number
}

export type Capability = (typeof REQUIRED_CAPABILITIES)[number]

export type FlowComputerDevice = Homey.Device & {
  startComputer(): Promise<void>
  shutdownComputer(): Promise<void>
}

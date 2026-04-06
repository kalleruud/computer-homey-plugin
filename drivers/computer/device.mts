import Homey from 'homey'
import { pollComputerConnectionState } from '../../src/computer/connected.js'
import { shutdownComputerOverSsh } from '../../src/computer/poweroff.js'
import { sendWakeOnLan } from '../../src/computer/poweron.js'
import {
  assertCanShutdown,
  assertCanWake,
  getComputerSettings,
  getPollIntervalMs,
} from '../../src/computer/settings.js'
import {
  SHUTDOWN_REFRESH_DELAY_MS,
  STARTUP_REFRESH_DELAY_MS,
} from '../../src/constants.js'
import { ComputerDriverSettings, DeviceSettingsEvent } from '../../src/types.js'

type DeviceState = {
  pollInFlight: boolean
  pollIntervalTimer?: ReturnType<typeof setInterval>
  refreshTimer?: ReturnType<typeof setTimeout>
  onlineSinceAt?: number
  pingCommandMissingLogged: boolean
}

const deviceStates = new WeakMap<Homey.Device, DeviceState>()
const REQUIRED_CAPABILITIES = ['connected', 'poweron', 'poweroff', 'uptime']

export default class ComputerDevice extends Homey.Device {
  override async onInit() {
    this.log('Computer device has been initialized')

    await this.ensureRequiredCapabilities()

    this.registerCapabilityListener('poweron', async () => {
      await this.startComputer()
    })
    this.registerCapabilityListener('poweroff', async () => {
      await this.shutdownComputer()
    })

    await this.startPolling()
  }

  override onAdded() {
    this.log('Computer device has been added')
  }

  override async onSettings(event: DeviceSettingsEvent) {
    this.log('Computer settings changed', event.changedKeys)
    await this.startPolling()
    return 'Settings updated.'
  }

  override onRenamed(name: string) {
    this.log('Computer device was renamed to', name)
  }

  override onDeleted() {
    this.stopPolling()
    this.log('Computer device has been deleted')
  }

  override async onUninit() {
    this.stopPolling()
    this.log('Computer device has been uninitialized')
  }

  async startComputer() {
    const settings = this.getComputerSettings()
    assertCanWake(settings)

    try {
      await sendWakeOnLan(settings)
    } catch (error) {
      this.error('Failed to send a Wake-on-LAN packet', error)
      throw new Error('Failed to send the Wake-on-LAN packet.')
    }

    this.scheduleRefresh(STARTUP_REFRESH_DELAY_MS)
  }

  async shutdownComputer() {
    const settings = this.getComputerSettings()
    assertCanShutdown(settings)

    try {
      await shutdownComputerOverSsh(settings)
    } catch (error) {
      this.error('Failed to shut down the computer over SSH', error)
      throw new Error('Failed to shut down the computer over SSH.')
    }

    this.scheduleRefresh(SHUTDOWN_REFRESH_DELAY_MS)
  }

  private getComputerSettings(): ComputerDriverSettings {
    return getComputerSettings(this.getSettings())
  }

  private getDeviceState(): DeviceState {
    const existingState = deviceStates.get(this)
    if (existingState) {
      return existingState
    }

    const nextState: DeviceState = {
      pollInFlight: false,
      pingCommandMissingLogged: false,
    }

    deviceStates.set(this, nextState)

    return nextState
  }

  private async ensureRequiredCapabilities() {
    for (const capabilityId of REQUIRED_CAPABILITIES) {
      if (!this.hasCapability(capabilityId)) {
        await this.addCapability(capabilityId)
      }
    }
  }

  private async startPolling() {
    this.stopPolling()

    const state = this.getDeviceState()
    const intervalMs = getPollIntervalMs(this.getComputerSettings())

    this.log(`Starting computer status polling every ${intervalMs} ms`)

    state.pollIntervalTimer = this.homey.setInterval(() => {
      this.log('Polling timer fired')
      this.refreshComputerState()
    }, intervalMs)

    this.log('Running initial poll immediately after startup')
    await this.refreshComputerState()
  }

  private stopPolling() {
    const state = this.getDeviceState()

    if (state.pollIntervalTimer) {
      this.homey.clearInterval(state.pollIntervalTimer)
      state.pollIntervalTimer = undefined
    }

    if (state.refreshTimer) {
      this.homey.clearTimeout(state.refreshTimer)
      state.refreshTimer = undefined
    }
  }

  private scheduleRefresh(delayMs: number) {
    const state = this.getDeviceState()

    if (state.refreshTimer) {
      this.homey.clearTimeout(state.refreshTimer)
    }

    this.log(`Scheduling follow-up poll in ${delayMs} ms`)

    state.refreshTimer = this.homey.setTimeout(() => {
      this.getDeviceState().refreshTimer = undefined
      this.log('Scheduled follow-up poll fired')
      this.refreshComputerState()
    }, delayMs)
  }

  private async refreshComputerState(): Promise<boolean> {
    const state = this.getDeviceState()
    if (state.pollInFlight) {
      this.log('Skipping poll because another poll is already running')
      return this.getCapabilityValue('connected') === true
    }

    state.pollInFlight = true

    try {
      const settings = this.getComputerSettings()
      this.log(
        `Polling computer status for ${settings.ipAddress || '<missing ip>'} on SSH port ${settings.sshPort.toString()}`
      )

      const nextState = await pollComputerConnectionState(
        settings,
        () => {
          if (state.pingCommandMissingLogged) {
            return
          }

          state.pingCommandMissingLogged = true
          this.error('Ping command is not available for fallback status checks')
        }
      )

      return await this.applyConnectionState(nextState)
    } catch (error) {
      this.error('Failed to poll the computer status', error)
      return this.getCapabilityValue('connected') === true
    } finally {
      state.pollInFlight = false
    }
  }

  private async applyConnectionState({
    isOnline,
    warning,
  }: Awaited<
    ReturnType<typeof pollComputerConnectionState>
  >): Promise<boolean> {
    this.log(
      `Poll result: online=${isOnline.toString()} warning=${warning ?? 'none'}`
    )

    if (warning) {
      await this.setWarning(warning)
    } else {
      await this.unsetWarning()
    }

    const state = this.getDeviceState()
    const now = Date.now()
    if (isOnline) {
      state.onlineSinceAt ??= now
    } else {
      state.onlineSinceAt = undefined
    }

    const uptimeSeconds =
      state.onlineSinceAt === undefined
        ? 0
        : Math.max(0, Math.floor((now - state.onlineSinceAt) / 1000))

    if (
      this.hasCapability('connected') &&
      this.getCapabilityValue('connected') !== isOnline
    ) {
      await this.setCapabilityValue('connected', isOnline)
    }

    if (
      this.hasCapability('uptime') &&
      this.getCapabilityValue('uptime') !== uptimeSeconds
    ) {
      await this.setCapabilityValue('uptime', uptimeSeconds)
    }

    this.log(
      `Applied capability state: connected=${isOnline.toString()} uptime=${uptimeSeconds.toString()}`
    )

    return isOnline
  }
}

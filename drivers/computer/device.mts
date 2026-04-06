import Homey from 'homey'
import {
  scheduleRefresh,
  startPolling,
  stopPolling,
} from '../../src/computer/connected.js'
import { shutdownComputerOverSsh as shutdownComputer } from '../../src/computer/poweroff.js'
import { sendWakeOnLan } from '../../src/computer/poweron.js'
import {
  assertCanShutdown,
  assertCanWake,
  getComputerSettings,
} from '../../src/computer/settings.js'
import { ensureCapabilities } from '../../src/lib.js'
import type { Capability, DeviceSettingsEvent } from '../../src/types.js'

export default class ComputerDevice extends Homey.Device {
  override async onInit() {
    this.log('Computer device has been initialized')
    await ensureCapabilities(this)

    this.registerCapabilityListener(
      'poweron' satisfies Capability,
      async () => {
        await this.startComputer()
      }
    )

    this.registerCapabilityListener(
      'poweron' satisfies Capability,
      async () => {
        await this.shutdownComputer()
      }
    )

    await startPolling(this)
  }

  override onAdded() {
    this.log('Computer device has been added')
  }

  override async onSettings(event: DeviceSettingsEvent) {
    this.log('Computer settings changed', event.changedKeys)
    await startPolling(this)
  }

  override onRenamed(name: string) {
    this.log('Computer device was renamed to', name)
  }

  override onDeleted() {
    this.log('Computer device has been deleted')
    stopPolling(this)
  }

  override async onUninit() {
    this.log('Computer device has been uninitialized')
    stopPolling(this)
    this.removeAllListeners()
  }

  async startComputer() {
    const settings = getComputerSettings(this.getSettings())
    assertCanWake(settings)

    try {
      await sendWakeOnLan(settings)
    } catch (error) {
      this.error('Failed to send a Wake-on-LAN packet', error)
      throw new Error('Failed to send the Wake-on-LAN packet.')
    }

    scheduleRefresh(this)
  }

  async shutdownComputer() {
    const settings = getComputerSettings(this.getSettings())
    assertCanShutdown(settings)

    try {
      await shutdownComputer(settings)
    } catch (error) {
      this.error('Failed to shut down the computer over SSH', error)
      throw new Error('Failed to shut down the computer over SSH.')
    }

    scheduleRefresh(this)
  }
}

import Homey from 'homey'
import { startPolling, stopPolling } from '../../src/computer/connected.js'
import { shutdownComputerOverSsh as shutdownComputer } from '../../src/computer/poweroff.js'
import { powerOnOverSsh } from '../../src/computer/poweron-ssh.js'
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
      'poweroff' satisfies Capability,
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
  }

  async startComputer() {
    const settings = getComputerSettings(this.getSettings())
    try {
      assertCanWake(settings)
    } catch (error) {
      throw new Error(this.translateError(error))
    }

    try {
      if (settings.startupMode === 'ssh') {
        await powerOnOverSsh(settings)
      } else {
        await sendWakeOnLan(settings)
      }
    } catch (error) {
      if (isErrorWithTranslationKey(error)) {
        throw new Error(this.homey.__(error.message))
      }

      if (settings.startupMode === 'ssh') {
        this.error('Failed to turn on the computer over SSH', error)
        throw new Error(this.homey.__('errors.powerOnOverSshFailed'))
      }

      this.error('Failed to send a Wake-on-LAN packet', error)
      throw new Error(this.homey.__('errors.wakeOnLanSendFailed'))
    }
  }

  async shutdownComputer() {
    const settings = getComputerSettings(this.getSettings())
    try {
      assertCanShutdown(settings)
    } catch (error) {
      throw new Error(this.translateError(error))
    }

    try {
      await shutdownComputer(settings)
    } catch (error) {
      this.error('Failed to shut down the computer over SSH', error)
      throw new Error(this.homey.__('errors.shutdownOverSshFailed'))
    }
  }

  private translateError(error: unknown): string {
    if (isErrorWithTranslationKey(error)) {
      return this.homey.__(error.message)
    }

    if (error instanceof Error) {
      return error.message
    }

    return 'Unknown error'
  }
}

function isErrorWithTranslationKey(
  error: unknown
): error is Error & { message: `errors.${string}` } {
  return error instanceof Error && error.message.startsWith('errors.')
}

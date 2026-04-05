import Homey from 'homey'
import {
  onInit,
  onSettings,
  shutdownComputer,
  startComputer,
  stopPolling,
} from './device/controller.mjs'
import type { DeviceSettingsEvent } from './device/types.mjs'

export default class ComputerDevice extends Homey.Device {
  override async onInit() {
    await onInit(this)
  }

  override async onAdded() {
    this.log('Computer device has been added')
  }

  override async onSettings(event: DeviceSettingsEvent) {
    return onSettings(this, event)
  }

  override async onRenamed(name: string) {
    this.log('Computer device was renamed to', name)
  }

  override async onDeleted() {
    stopPolling(this)
    this.log('Computer device has been deleted')
  }

  override async onUninit() {
    stopPolling(this)
  }

  async startComputer() {
    await startComputer(this)
  }

  async shutdownComputer() {
    await shutdownComputer(this)
  }
}

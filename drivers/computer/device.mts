import Homey from 'homey'
import {
  onInit,
  onSettings,
  shutdownComputer,
  startComputer,
  stopPolling,
} from './device/controller.js'
import type { DeviceSettingsEvent } from './device/types.js'

export default class ComputerDevice extends Homey.Device {
  override async onInit() {
    await onInit(this)
  }

  override onAdded() {
    this.log('Computer device has been added')
  }

  override async onSettings(event: DeviceSettingsEvent) {
    return onSettings(this, event)
  }

  override onRenamed(name: string) {
    this.log('Computer device was renamed to', name)
  }

  override onDeleted() {
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

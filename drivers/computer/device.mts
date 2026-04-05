import Homey from 'homey'
import {
  onAdded,
  onDeleted,
  onInit,
  onRenamed,
  onSettings,
  onUninit,
  shutdownComputer,
  startComputer,
} from './device/controller.mjs'
import type { DeviceSettingsEvent } from './device/types.mjs'

export default class ComputerDevice extends Homey.Device {
  override async onInit() {
    await onInit(this)
  }

  override async onAdded() {
    await onAdded(this)
  }

  override async onSettings(event: DeviceSettingsEvent) {
    return onSettings(this, event)
  }

  override async onRenamed(name: string) {
    await onRenamed(this, name)
  }

  override async onDeleted() {
    await onDeleted(this)
  }

  override async onUninit() {
    await onUninit(this)
  }

  async startComputer() {
    await startComputer(this)
  }

  async shutdownComputer() {
    await shutdownComputer(this)
  }
}

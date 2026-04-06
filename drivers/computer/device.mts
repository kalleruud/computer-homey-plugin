import { DeviceSettingsEvent } from '@src/types.js'
import Homey from 'homey'

export default class ComputerDevice extends Homey.Device {
  override async onInit() {
    // TODO: Implement logic for device initialization
  }

  override onAdded() {
    this.log('Computer device has been added')
  }

  override async onSettings(event: DeviceSettingsEvent) {
    // TODO: Implement logic for settings handling
  }

  override onRenamed(name: string) {
    this.log('Computer device was renamed to', name)
  }

  override onDeleted() {
    this.log('Computer device has been deleted')
    // TODO: Stop polling
  }

  override async onUninit() {
    this.log('Computer device has been uninitialized')
    // TODO: Stop polling
  }

  async startComputer() {
    // TODO: Implement logic for sending a Wake-on-LAN packet
  }

  async shutdownComputer() {
    // TODO: Implement logic for shutting down the computer over SSH
  }
}

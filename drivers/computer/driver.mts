import { randomUUID } from 'node:crypto'

import Homey from 'homey'

type ComputerDeviceActions = {
  startComputer(): Promise<void>
  shutdownComputer(): Promise<void>
}

export default class ComputerDriver extends Homey.Driver {
  override async onInit() {
    this.homey.flow
      .getActionCard('start_computer')
      .registerRunListener(async ({ device }) => {
        await (device as ComputerDeviceActions).startComputer()
        return true
      })

    this.homey.flow
      .getActionCard('shutdown_computer')
      .registerRunListener(async ({ device }) => {
        await (device as ComputerDeviceActions).shutdownComputer()
        return true
      })

    this.log('Computer driver has been initialized')
  }

  override async onPairListDevices() {
    const index = this.getDevices().length + 1
    const defaultName = index === 1 ? 'Computer' : `Computer ${index}`

    return [
      {
        name: defaultName,
        data: {
          id: randomUUID(),
        },
      },
    ]
  }
}

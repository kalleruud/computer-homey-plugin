import { randomUUID } from 'node:crypto'

import Homey from 'homey'

export default class ComputerDriver extends Homey.Driver {
  override async onInit() {
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

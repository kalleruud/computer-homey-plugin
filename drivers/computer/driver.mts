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
    if (this.getDevices().length > 0) {
      return []
    }

    return [
      {
        name: 'Computer',
        data: {
          id: 'computer',
        },
      },
    ]
  }
}

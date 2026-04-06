import { randomUUID } from 'node:crypto'

import Homey from 'homey'
import { FLOW_CARD_IDS } from '../../src/constants.js'
import type { FlowComputerDevice } from '../../src/types.js'

export default class ComputerDriver extends Homey.Driver {
  private turnedOnTriggerCard!: Homey.FlowCardTriggerDevice
  private turnedOffTriggerCard!: Homey.FlowCardTriggerDevice
  private uptimeChangedTriggerCard!: Homey.FlowCardTriggerDevice

  override async onInit() {
    this.turnedOnTriggerCard = this.homey.flow.getDeviceTriggerCard(
      FLOW_CARD_IDS.triggers.turnedOn
    )
    this.turnedOffTriggerCard = this.homey.flow.getDeviceTriggerCard(
      FLOW_CARD_IDS.triggers.turnedOff
    )
    this.uptimeChangedTriggerCard = this.homey.flow.getDeviceTriggerCard(
      FLOW_CARD_IDS.triggers.uptimeChanged
    )

    this.homey.flow
      .getConditionCard(FLOW_CARD_IDS.conditions.isOn)
      .registerRunListener(async args => {
        return args.device.getCapabilityValue('connected') === true
      })

    this.homey.flow
      .getActionCard(FLOW_CARD_IDS.actions.turnOn)
      .registerRunListener(async args => {
        await (args.device as FlowComputerDevice).startComputer()
      })

    this.homey.flow
      .getActionCard(FLOW_CARD_IDS.actions.turnOff)
      .registerRunListener(async args => {
        await (args.device as FlowComputerDevice).shutdownComputer()
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

  triggerComputerTurnedOn(device: Homey.Device) {
    void this.turnedOnTriggerCard.trigger(device).catch(this.error)
  }

  triggerComputerTurnedOff(device: Homey.Device) {
    void this.turnedOffTriggerCard.trigger(device).catch(this.error)
  }

  triggerComputerUptimeChanged(device: Homey.Device, uptime: number) {
    void this.uptimeChangedTriggerCard
      .trigger(device, { uptime })
      .catch(this.error)
  }
}

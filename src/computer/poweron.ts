import dgram from 'node:dgram'

import { DEFAULTS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { parseMacAddress } from './settings.js'

export async function sendWakeOnLan(settings: ComputerDriverSettings) {
  const macAddress = parseMacAddress(settings.macAddress)
  const magicPacket = Buffer.alloc(6 + 16 * macAddress.length, 0xff)

  for (let index = 0; index < 16; index += 1) {
    macAddress.copy(magicPacket, 6 + index * macAddress.length)
  }

  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket('udp4')

    socket.once('error', error => {
      socket.close()
      reject(error)
    })

    socket.bind(() => {
      socket.setBroadcast(true)
      socket.send(
        magicPacket,
        DEFAULTS.WOL_PORT,
        settings.wolBroadcastAddress,
        error => {
          socket.close()

          if (error) {
            reject(error)
            return
          }

          resolve()
        }
      )
    })
  })
}

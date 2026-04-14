import dgram from 'node:dgram'

import { DEFAULTS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { inferWolBroadcastAddress, parseMacAddress } from './settings.js'

export async function sendWakeOnLan(settings: ComputerDriverSettings) {
  await Promise.all(
    settings.macAddresses.map(async (macAddressString, index) => {
      const macAddress = parseMacAddress(macAddressString)
      const magicPacket = Buffer.alloc(6 + 16 * macAddress.length, 0xff)

      for (let magicIndex = 0; magicIndex < 16; magicIndex += 1) {
        macAddress.copy(magicPacket, 6 + magicIndex * macAddress.length)
      }

      const ipIndex = Math.min(index, settings.ipAddresses.length - 1)
      const wolBroadcastAddress =
        ipIndex >= 0
          ? inferWolBroadcastAddress(settings.ipAddresses[ipIndex] ?? '')
          : DEFAULTS.WOL_BROADCAST_ADDRESS

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
            wolBroadcastAddress,
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
    })
  )
}

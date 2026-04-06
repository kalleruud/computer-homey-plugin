import { execFile } from 'node:child_process'
import net from 'node:net'

import { POLL_TIMEOUT_MS } from '../constants'

export async function probeTcpPort(host: string, port: number) {
  return new Promise<boolean>(resolve => {
    const socket = new net.Socket()
    let settled = false

    const finish = (isOnline: boolean) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(isOnline)
    }

    socket.setTimeout(POLL_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

export async function probePing(host: string, onMissingCommand: () => void) {
  return new Promise<boolean>(resolve => {
    execFile('ping', ['-c', '1', '-W', '1', host], error => {
      if (!error) {
        resolve(true)
        return
      }

      if ('code' in error && error.code === 'ENOENT') {
        onMissingCommand()
      }

      resolve(false)
    })
  })
}

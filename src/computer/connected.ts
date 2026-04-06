import { execFile } from 'node:child_process'
import net from 'node:net'

import { POLL_TIMEOUT_MS, SSH_UNAVAILABLE_WARNING } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { getProbeValidationError } from './settings.js'

type ComputerConnectionState = {
  isOnline: boolean
  warning?: string
}

export async function pollComputerConnectionState(
  settings: ComputerDriverSettings,
  onMissingPingCommand: () => void
): Promise<ComputerConnectionState> {
  const validationError = getProbeValidationError(settings)
  if (validationError) {
    return {
      isOnline: false,
      warning: validationError,
    }
  }

  const isSshReachable = await probeTcpPort(
    settings.ipAddress,
    settings.sshPort
  )
  if (isSshReachable) {
    return {
      isOnline: true,
    }
  }

  const isPingReachable = await probePing(
    settings.ipAddress,
    onMissingPingCommand
  )
  if (isPingReachable) {
    return {
      isOnline: true,
      warning: SSH_UNAVAILABLE_WARNING,
    }
  }

  return {
    isOnline: false,
  }
}

async function probeTcpPort(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
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

async function probePing(
  host: string,
  onMissingPingCommand: () => void
): Promise<boolean> {
  return new Promise(resolve => {
    execFile('ping', ['-c', '1', '-W', '1', host], error => {
      if (!error) {
        resolve(true)
        return
      }

      if ('code' in error && error.code === 'ENOENT') {
        onMissingPingCommand()
      }

      resolve(false)
    })
  })
}

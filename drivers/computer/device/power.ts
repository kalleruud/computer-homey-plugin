import dgram from 'node:dgram'

import { Client, type ClientChannel } from 'ssh2'

import { DEFAULTS, SSH_READY_TIMEOUT_MS, SUDO_PROMPT } from '../constants'
import { getShutdownCommand, parseMacAddress } from './device-validation'
import type { ComputerSettings, Translate } from './types'

type ErrorLogger = (message: string, error: unknown) => void

type PowerOptions = {
  logError: ErrorLogger
  translate: Translate
}

export async function sendWakeOnLan(
  settings: ComputerSettings,
  { logError, translate }: PowerOptions
) {
  const macAddress = parseMacAddress(settings.macAddress, translate)
  const magicPacket = Buffer.alloc(6 + 16 * macAddress.length, 0xff)

  for (let index = 0; index < 16; index += 1) {
    macAddress.copy(magicPacket, 6 + index * macAddress.length)
  }

  try {
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
  } catch (error) {
    logError('Failed to send the Wake-on-LAN packet', error)
    throw new Error(translate('errors.startup_failed'))
  }
}

export async function executeShutdown(
  settings: ComputerSettings,
  { logError, translate }: PowerOptions
) {
  const command = getShutdownCommand(settings.targetOs)
  const needsSudo = settings.targetOs !== 'windows'

  try {
    await executeSshCommand(settings, command, needsSudo)
  } catch (error) {
    logError('Failed to shut down the computer over SSH', error)
    throw new Error(translate('errors.ssh_shutdown_failed'))
  }
}

async function executeSshCommand(
  settings: ComputerSettings,
  command: string,
  needsSudo: boolean
) {
  await new Promise<void>((resolve, reject) => {
    const client = new Client()
    let settled = false
    let passwordSent = false
    let stdout = ''
    let stderr = ''

    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      client.end()

      if (error) {
        reject(error)
        return
      }

      resolve()
    }

    const maybeSendPassword = (chunk: string, stream: ClientChannel) => {
      if (!needsSudo || passwordSent || !chunk.includes(SUDO_PROMPT)) {
        return
      }

      passwordSent = true
      stream.write(`${settings.sshPassword}\n`)
    }

    client.once('error', finish)

    client.once('ready', () => {
      client.exec(command, { pty: needsSudo }, (error, stream) => {
        if (error) {
          finish(error)
          return
        }

        stream.once('error', finish)

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stdout += chunk
          maybeSendPassword(chunk, stream)
        })

        stream.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stderr += chunk
          maybeSendPassword(chunk, stream)
        })

        stream.once('close', (code: number | null) => {
          if (code === 0 || code === null) {
            finish()
            return
          }

          const errorMessage =
            stderr.trim() ||
            stdout.trim() ||
            `SSH command exited with code ${code.toString()}`

          finish(new Error(errorMessage))
        })
      })
    })

    client.connect({
      host: settings.ipAddress,
      port: settings.sshPort,
      username: settings.sshUsername,
      password: settings.sshPassword,
      readyTimeout: SSH_READY_TIMEOUT_MS,
      keepaliveInterval: 2000,
      keepaliveCountMax: 2,
    })
  })
}

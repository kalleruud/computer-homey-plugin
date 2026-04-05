import { createHash } from 'node:crypto'
import dgram from 'node:dgram'

import { Client } from 'ssh2'

import { DEFAULTS, SSH_READY_TIMEOUT_MS } from '../constants.js'
import {
  getShutdownCommand,
  parseMacAddress,
  parseSshHostFingerprint,
} from './device-validation.mjs'
import type { ComputerSettings, Translate } from './types.mjs'

type ErrorLogger = (message: string, error: unknown) => void

type PowerOptions = {
  logError: ErrorLogger
  translate: Translate
}

const SSH_COMMAND_FAILED_ERROR = 'SSH shutdown command failed'
const SSH_HOST_VERIFICATION_FAILED_ERROR = 'SSH host verification failed'
const SSH_PASSWORDLESS_SUDO_REQUIRED_ERROR =
  'SSH shutdown requires passwordless sudo'

const PASSWORDLESS_SUDO_ERROR_PATTERNS = [
  /sudo: .*password.*required/iu,
  /sudo: no tty present and no askpass program specified/iu,
  /sudo: a terminal is required to read the password/iu,
  /sudo: sorry, you must have a tty to run sudo/iu,
]

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
  const expectedHostFingerprint = parseSshHostFingerprint(
    settings.sshHostFingerprint,
    translate
  )

  try {
    await executeSshCommand(settings, command, expectedHostFingerprint)
  } catch (error) {
    const { logMessage, userMessage } = getShutdownFailure(error, translate)

    logError(logMessage, new Error(logMessage))
    throw new Error(userMessage)
  }
}

async function executeSshCommand(
  settings: ComputerSettings,
  command: string,
  expectedHostFingerprint: string
) {
  await new Promise<void>((resolve, reject) => {
    const client = new Client()
    let settled = false
    let hostVerificationFailed = false
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

    client.once('error', error => {
      if (hostVerificationFailed) {
        finish(new Error(SSH_HOST_VERIFICATION_FAILED_ERROR))
        return
      }

      finish(error)
    })

    client.once('ready', () => {
      client.exec(command, (error, stream) => {
        if (error) {
          finish(error)
          return
        }

        stream.once('error', finish)

        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        stream.once('close', (code: number | null) => {
          if (code === 0 || code === null) {
            finish()
            return
          }

          const remoteOutput = `${stderr}\n${stdout}`

          if (requiresPasswordlessSudo(remoteOutput)) {
            finish(new Error(SSH_PASSWORDLESS_SUDO_REQUIRED_ERROR))
            return
          }

          finish(new Error(SSH_COMMAND_FAILED_ERROR))
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
      hostVerifier: (key: Buffer) => {
        const actualHostFingerprint = getHostFingerprint(key)
        const isVerified = actualHostFingerprint === expectedHostFingerprint

        if (!isVerified) {
          hostVerificationFailed = true
        }

        return isVerified
      },
    })
  })
}

function getHostFingerprint(key: Buffer) {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/u, '')}`
}

function requiresPasswordlessSudo(remoteOutput: string) {
  return PASSWORDLESS_SUDO_ERROR_PATTERNS.some(pattern =>
    pattern.test(remoteOutput)
  )
}

function getShutdownFailure(error: unknown, translate: Translate) {
  const message = error instanceof Error ? error.message : ''

  if (message === SSH_HOST_VERIFICATION_FAILED_ERROR) {
    return {
      logMessage:
        'Failed to shut down the computer over SSH: host verification failed',
      userMessage: translate('errors.ssh_host_verification_failed'),
    }
  }

  if (message === SSH_PASSWORDLESS_SUDO_REQUIRED_ERROR) {
    return {
      logMessage:
        'Failed to shut down the computer over SSH: passwordless sudo is required',
      userMessage: translate('errors.ssh_shutdown_requires_passwordless_sudo'),
    }
  }

  return {
    logMessage: 'Failed to shut down the computer over SSH',
    userMessage: translate('errors.ssh_shutdown_failed'),
  }
}

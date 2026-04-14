import { Client } from 'ssh2'

import {
  SHUTDOWN_COMMANDS,
  SSH_READY_TIMEOUT_MS,
  SUDO_PROMPT,
} from '../constants.js'
import { ComputerDriverSettings } from '../types.js'

export async function shutdownComputerOverSsh(
  settings: ComputerDriverSettings
) {
  const errors: Error[] = []

  for (const host of settings.ipAddresses) {
    try {
      await shutdownComputerOverSshOnHost(settings, host)
      return
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const firstError = errors[0]
  if (firstError) {
    throw firstError
  }
}

async function shutdownComputerOverSshOnHost(
  settings: ComputerDriverSettings,
  host: string
) {
  const command = SHUTDOWN_COMMANDS[settings.targetOs]
  const needsSudo = settings.targetOs !== 'windows'

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

    const maybeSendPassword = (
      chunk: string,
      stream: { write(data: string): void }
    ) => {
      if (!needsSudo || passwordSent || !chunk.includes(SUDO_PROMPT)) {
        return
      }

      passwordSent = true
      stream.write(`${settings.sshPassword}\n`)
    }

    client.once('error', error => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })

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
      host,
      port: settings.sshPort,
      username: settings.sshUsername,
      password: settings.sshPassword,
      readyTimeout: SSH_READY_TIMEOUT_MS,
      keepaliveInterval: 2000,
      keepaliveCountMax: 2,
    })
  })
}

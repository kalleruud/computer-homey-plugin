import timers from 'node:timers'
import { Client, utils } from 'ssh2'

import {
  SHUTDOWN_COMMANDS,
  SSH_READY_TIMEOUT_MS,
  SUDO_PROMPT,
} from '../constants.js'
import { ComputerDriverSettings } from '../types.js'

export async function runSshCommandOnHost(
  settings: ComputerDriverSettings,
  host: string,
  command: string,
  usePty: boolean
): Promise<void> {
  const keyMode = settings.sshPrivateKey.length > 0
  if (keyMode) {
    let key
    try {
      key = utils.parseKey(
        settings.sshPrivateKey,
        settings.sshKeyPassphrase || undefined
      )
    } catch {
      throw new Error('errors.sshKeyInvalid')
    }
    if (
      key instanceof Error ||
      Array.isArray(key) ||
      !['ssh-ed25519', 'ssh-rsa'].includes(key.type) ||
      !key.isPrivateKey()
    ) {
      throw new Error('errors.sshKeyInvalid')
    }
    // No terminal or stdin credentials in key mode; sudo must be non-interactive.
    if (command === SHUTDOWN_COMMANDS.linux) {
      command = 'sudo -n shutdown -h now'
    }
    usePty = false
  }
  const needsSudoPassword = usePty && settings.targetOs !== 'windows'

  await new Promise<void>((resolve, reject) => {
    const client = new Client()
    let settled = false
    let passwordSent = false
    let stdout = ''
    let stderr = ''

    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
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
      if (!needsSudoPassword || passwordSent || !chunk.includes(SUDO_PROMPT)) {
        return
      }

      passwordSent = true
      stream.write(`${settings.sshPassword}\n`)
    }

    if (keyMode) {
      // Cleared by finish on every completion/error path.
      timer = timers.setTimeout(
        () => finish(new Error('errors.sshKeyTimeout')),
        30_000
      )
    }
    client.once('error', () => {
      finish(
        new Error(keyMode ? 'errors.sshKeyFailed' : 'SSH connection failed')
      )
    })

    client.once('ready', () => {
      client.exec(command, { pty: usePty }, (error, stream) => {
        if (error) {
          finish(
            new Error(
              keyMode ? 'errors.sshKeyCommandFailed' : 'SSH command failed'
            )
          )
          return
        }

        stream.once('error', () =>
          finish(
            new Error(
              keyMode ? 'errors.sshKeyCommandFailed' : 'SSH stream failed'
            )
          )
        )
        if (keyMode) stream.end()
        stream.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stdout += chunk
          if (keyMode && (stdout + stderr).includes(SUDO_PROMPT)) {
            finish(new Error('errors.sshKeyCommandFailed'))
          }
          maybeSendPassword(chunk, stream)
        })
        stream.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stderr += chunk
          if (keyMode && (stdout + stderr).includes(SUDO_PROMPT)) {
            finish(new Error('errors.sshKeyCommandFailed'))
          }
          maybeSendPassword(chunk, stream)
        })
        stream.once('close', (code: number | null | undefined) => {
          if (!code) {
            finish()
            return
          }

          const errorMessage = keyMode
            ? 'errors.sshKeyCommandFailed'
            : `SSH command exited with code ${String(code)}`

          finish(new Error(errorMessage))
        })
      })
    })

    try {
      client.connect({
        host,
        port: settings.sshPort,
        username: settings.sshUsername,
        ...(keyMode
          ? {
              privateKey: settings.sshPrivateKey,
              passphrase: settings.sshKeyPassphrase || undefined,
              authHandler: ['publickey'] as 'publickey'[],
            }
          : { password: settings.sshPassword }),
        readyTimeout: SSH_READY_TIMEOUT_MS,
        keepaliveInterval: 2000,
        keepaliveCountMax: 2,
      })
    } catch {
      finish(
        new Error(keyMode ? 'errors.sshKeyInvalid' : 'SSH connection failed')
      )
    }
  })
}

import { Client } from 'ssh2'

import { SSH_READY_TIMEOUT_MS, SUDO_PROMPT } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'

export async function runSshCommandOnHost(
  settings: ComputerDriverSettings,
  host: string,
  command: string,
  usePty: boolean
): Promise<void> {
  const needsSudoPassword = usePty && settings.targetOs !== 'windows'

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
      if (!needsSudoPassword || passwordSent || !chunk.includes(SUDO_PROMPT)) {
        return
      }

      passwordSent = true
      stream.write(`${settings.sshPassword}\n`)
    }

    client.once('error', error => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })

    client.once('ready', () => {
      client.exec(command, { pty: usePty }, (error, stream) => {
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
        stream.once('close', (code: number | null | undefined) => {
          if (!code) {
            finish()
            return
          }

          const errorMessage =
            stderr.trim() ||
            stdout.trim() ||
            `SSH command exited with code ${String(code)}`

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

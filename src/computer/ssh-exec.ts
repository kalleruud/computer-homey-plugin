import { clearTimeout, setTimeout as queryTimeout } from 'node:timers'
import { Client } from 'ssh2'

import { SSH_READY_TIMEOUT_MS, SUDO_PROMPT } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'

export async function runSshCommandOnHost(
  settings: ComputerDriverSettings,
  host: string,
  command: string,
  options: {
    usePty?: boolean
    timeoutMs?: number
    maxOutputBytes?: number
    requireExitCode?: boolean
  } = {}
): Promise<string> {
  const {
    usePty = false,
    timeoutMs,
    maxOutputBytes,
    requireExitCode = false,
  } = options
  const needsSudoPassword = usePty && settings.targetOs !== 'windows'

  return new Promise<string>((resolve, reject) => {
    const client = new Client()
    let settled = false
    let passwordSent = false
    let stdout = ''
    let stderr = ''

    const timer = timeoutMs
      ? queryTimeout(
          () => finish(new Error('SSH command timed out')),
          timeoutMs
        )
      : undefined

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

      resolve(stdout)
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
          if (
            maxOutputBytes &&
            Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
              maxOutputBytes
          )
            finish(new Error('SSH output too large'))
          maybeSendPassword(chunk, stream)
        })
        stream.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stderr += chunk
          if (
            maxOutputBytes &&
            Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
              maxOutputBytes
          )
            finish(new Error('SSH output too large'))
          maybeSendPassword(chunk, stream)
        })
        stream.once('close', (code: number | null | undefined) => {
          if (requireExitCode ? code === 0 : !code) {
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

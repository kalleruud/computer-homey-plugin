import timers from 'node:timers'
import { Client } from 'ssh2'

import { SSH_READY_TIMEOUT_MS, SUDO_PROMPT } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'

async function runSshCommandOnHost(
  settings: ComputerDriverSettings,
  host: string,
  command: string,
  usePty: boolean,
  requireExitCode: boolean,
  timeoutMs?: number
): Promise<void> {
  const needsSudoPassword = usePty && settings.targetOs !== 'windows'

  await new Promise<void>((resolve, reject) => {
    const client = new Client()
    let settled = false
    let passwordSent = false
    let stdout = ''
    let stderr = ''

    let timer: ReturnType<typeof timers.setTimeout> | undefined
    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      timers.clearTimeout(timer)
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

    if (timeoutMs) {
      timer = timers.setTimeout(
        () =>
          finish(
            new Error(
              `SSH command completion was not confirmed within ${timeoutMs} ms`
            )
          ),
        timeoutMs
      )
    }

    client.once('close', () => {
      finish(
        new Error(
          'SSH connection closed before command completion was confirmed'
        )
      )
    })

    client.once('error', error => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })

    client.once('ready', () => {
      if (settled) return
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

export async function runSshCommand(
  settings: ComputerDriverSettings,
  command: string,
  options: {
    usePty?: boolean
    requireExitCode?: boolean
    timeoutMs?: number
  } = {}
): Promise<void> {
  const usePty = options.usePty ?? settings.targetOs !== 'windows'
  try {
    await Promise.any(
      settings.ipAddresses.map(host =>
        runSshCommandOnHost(
          settings,
          host,
          command,
          usePty,
          options.requireExitCode === true,
          options.timeoutMs
        )
      )
    )
  } catch (error) {
    if (error instanceof AggregateError) {
      const [firstError] = error.errors
      if (firstError instanceof Error) {
        throw firstError
      }
    }
    throw error
  }
}

import timers from 'node:timers'
import {
  Client,
  utils,
  type ConnectConfig,
  type PublicKeyAuthMethod,
} from 'ssh2'

import { SSH_READY_TIMEOUT_MS, SUDO_PROMPT } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'

type SshAuthentication = Pick<ConnectConfig, 'password' | 'authHandler'>

export function getSshAuthentication(
  settings: ComputerDriverSettings
): SshAuthentication {
  if (!settings.sshPrivateKey) return { password: settings.sshPassword }

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
  // ssh2 accepts parsed keys in an explicit public-key authentication method.
  const method: PublicKeyAuthMethod = {
    type: 'publickey',
    username: settings.sshUsername,
    key,
  }
  return { authHandler: [method] }
}

export async function runSshCommandOnHost(
  settings: ComputerDriverSettings,
  host: string,
  command: string,
  options: {
    usePty?: boolean
    timeoutMs?: number
    maxOutputBytes?: number
    requireExitCode?: boolean
  } = {},
  authentication: SshAuthentication = getSshAuthentication(settings)
): Promise<string> {
  const { timeoutMs, maxOutputBytes, requireExitCode = false } = options
  let { usePty = false } = options
  const keyMode = settings.sshPrivateKey.length > 0
  // No terminal or stdin credentials in key mode; sudo must be non-interactive.
  if (keyMode) usePty = false
  const needsSudoPassword = usePty && settings.targetOs !== 'windows'

  return new Promise<string>((resolve, reject) => {
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
      timers.clearTimeout(timer)
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

    if (keyMode || timeoutMs) {
      // Cleared by finish on every completion/error path.
      timer = timers.setTimeout(
        () =>
          finish(
            new Error(
              keyMode ? 'errors.sshKeyTimeout' : 'SSH command timed out'
            )
          ),
        timeoutMs ?? 30_000
      )
    }
    client.once('error', () => {
      finish(
        new Error(keyMode ? 'errors.sshKeyFailed' : 'SSH connection failed')
      )
    })

    client.once('ready', () => {
      if (settled) return
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
          if (
            maxOutputBytes &&
            Buffer.byteLength(stdout) + Buffer.byteLength(stderr) >
              maxOutputBytes
          )
            finish(new Error('SSH output too large'))
          if (keyMode && (stdout + stderr).includes(SUDO_PROMPT)) {
            finish(new Error('errors.sshKeyCommandFailed'))
          }
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
          if (keyMode && (stdout + stderr).includes(SUDO_PROMPT)) {
            finish(new Error('errors.sshKeyCommandFailed'))
          }
          maybeSendPassword(chunk, stream)
        })
        stream.once('close', (code: number | null | undefined) => {
          if (requireExitCode ? code === 0 : !code) {
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
        ...authentication,
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

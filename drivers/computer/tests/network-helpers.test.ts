import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  DEFAULTS,
  POLL_TIMEOUT_MS,
  SHUTDOWN_COMMANDS,
  SUDO_PROMPT,
} from '../constants'
import { importFresh } from './test-helpers'

type SocketEvent = 'connect' | 'timeout' | 'error'

type SshScenario = {
  closeCode: number | null
  connectError?: Error
  execError?: Error
  stderrChunks?: string[]
  stdoutChunks?: string[]
}

let socketBehavior: SocketEvent = 'connect'
let connectArgs: { host: string; port: number } | undefined
let destroyCount = 0
let timeoutMs: number | undefined
let pingError: Error | NodeJS.ErrnoException | null = null
let execFileCalls: Array<{ command: string; args: string[] }> = []

let dgramSendError: Error | null = null
let lastSocketType: string | undefined
let socketWasClosed = false
let socketWasBound = false
let socketBroadcastValue = false
let lastSendArgs:
  | {
      address: string
      packet: Buffer
      port: number
    }
  | undefined

let sshScenario: SshScenario
let sshConnectOptions: Record<string, unknown> | undefined
let sshExecCommand: string | undefined
let sshExecOptions: Record<string, unknown> | undefined
let sshStreamWrites: string[] = []
let clientEnded = false

class FakeSocket {
  readonly listeners = new Map<string, () => void>()

  setTimeout(delayMs: number) {
    timeoutMs = delayMs
  }

  once(event: string, listener: () => void) {
    this.listeners.set(event, listener)
    return this
  }

  connect(port: number, host: string) {
    connectArgs = { host, port }

    queueMicrotask(() => {
      this.listeners.get(socketBehavior)?.()
    })
  }

  destroy() {
    destroyCount += 1
  }
}

class FakeDgramSocket {
  once() {
    return this
  }

  bind(callback: () => void) {
    socketWasBound = true
    callback()
  }

  setBroadcast(value: boolean) {
    socketBroadcastValue = value
  }

  send(
    packet: Buffer,
    port: number,
    address: string,
    callback: (error: Error | null) => void
  ) {
    lastSendArgs = { address, packet, port }
    callback(dgramSendError)
  }

  close() {
    socketWasClosed = true
  }
}

class FakeEmitter {
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  on(event: string, handler: (...args: unknown[]) => void) {
    const handlers = this.listeners.get(event) ?? []
    handlers.push(handler)
    this.listeners.set(event, handlers)
    return this
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    const wrappedHandler = (...args: unknown[]) => {
      this.off(event, wrappedHandler)
      handler(...args)
    }

    return this.on(event, wrappedHandler)
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    const handlers = this.listeners.get(event)

    if (!handlers) {
      return
    }

    this.listeners.set(
      event,
      handlers.filter(existingHandler => existingHandler !== handler)
    )
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args)
    }
  }
}

class FakeClientChannel extends FakeEmitter {
  readonly stderr = new FakeEmitter()

  write(chunk: string) {
    sshStreamWrites.push(chunk)
  }
}

class FakeSshClient extends FakeEmitter {
  connect(options: Record<string, unknown>) {
    sshConnectOptions = options

    queueMicrotask(() => {
      if (sshScenario.connectError) {
        this.emit('error', sshScenario.connectError)
        return
      }

      this.emit('ready')
    })
  }

  exec(
    command: string,
    options: Record<string, unknown>,
    callback: (error: Error | null, stream: FakeClientChannel) => void
  ) {
    sshExecCommand = command
    sshExecOptions = options

    if (sshScenario.execError) {
      callback(sshScenario.execError, new FakeClientChannel())
      return
    }

    const stream = new FakeClientChannel()
    callback(null, stream)

    queueMicrotask(() => {
      for (const chunk of sshScenario.stdoutChunks ?? []) {
        stream.emit('data', Buffer.from(chunk))
      }

      for (const chunk of sshScenario.stderrChunks ?? []) {
        stream.stderr.emit('data', Buffer.from(chunk))
      }

      stream.emit('close', sshScenario.closeCode)
    })
  }

  end() {
    clientEnded = true
  }
}

describe('computer network helpers', () => {
  beforeEach(() => {
    mock.restore()
    socketBehavior = 'connect'
    connectArgs = undefined
    destroyCount = 0
    timeoutMs = undefined
    pingError = null
    execFileCalls = []
    dgramSendError = null
    lastSocketType = undefined
    socketWasClosed = false
    socketWasBound = false
    socketBroadcastValue = false
    lastSendArgs = undefined
    sshScenario = {
      closeCode: 0,
      stderrChunks: [],
      stdoutChunks: [],
    }
    sshConnectOptions = undefined
    sshExecCommand = undefined
    sshExecOptions = undefined
    sshStreamWrites = []
    clientEnded = false

    mock.module('node:net', () => ({
      default: {
        Socket: FakeSocket,
      },
    }))

    mock.module('node:child_process', () => ({
      execFile: (
        command: string,
        args: string[],
        callback: (error: Error | NodeJS.ErrnoException | null) => void
      ) => {
        execFileCalls.push({ command, args })
        queueMicrotask(() => callback(pingError))
      },
    }))

    mock.module('node:dgram', () => ({
      default: {
        createSocket: (type: string) => {
          lastSocketType = type
          return new FakeDgramSocket()
        },
      },
    }))

    mock.module('ssh2', () => ({
      Client: FakeSshClient,
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('checks TCP and ping reachability', async () => {
    const { probePing, probeTcpPort } = await importFresh<
      typeof import('../device/probes.mts')
    >('../device/probes.mts')

    await expect(probeTcpPort('192.168.1.15', 22)).resolves.toBe(true)
    expect(timeoutMs).toBe(POLL_TIMEOUT_MS)
    expect(connectArgs).toEqual({ host: '192.168.1.15', port: 22 })
    expect(destroyCount).toBe(1)

    socketBehavior = 'timeout'
    await expect(probeTcpPort('192.168.1.15', 22)).resolves.toBe(false)

    const onMissingCommand = mock(() => undefined)
    await expect(probePing('192.168.1.15', onMissingCommand)).resolves.toBe(
      true
    )
    expect(execFileCalls[0]).toEqual({
      command: 'ping',
      args: ['-c', '1', '-W', '1', '192.168.1.15'],
    })

    pingError = Object.assign(new Error('missing ping'), { code: 'ENOENT' })
    await expect(probePing('192.168.1.15', onMissingCommand)).resolves.toBe(
      false
    )
    expect(onMissingCommand).toHaveBeenCalledTimes(1)
  })

  it('sends wake-on-lan packets and maps wake errors', async () => {
    const { sendWakeOnLan } = await importFresh<
      typeof import('../device/power.mts')
    >('../device/power.mts')

    const logError = mock(() => undefined)
    const translate = (key: string) => `translated:${key}`

    await sendWakeOnLan(
      {
        ipAddress: '192.168.1.10',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        pollIntervalSeconds: 60,
        targetOs: 'linux',
        sshUsername: 'admin',
        sshPassword: 'secret',
        sshPort: 22,
        wolBroadcastAddress: '192.168.1.255',
      },
      { logError, translate }
    )

    expect(lastSocketType).toBe('udp4')
    expect(socketWasBound).toBe(true)
    expect(socketBroadcastValue).toBe(true)
    expect(socketWasClosed).toBe(true)
    expect(lastSendArgs?.port).toBe(DEFAULTS.WOL_PORT)

    dgramSendError = new Error('send failed')
    await expect(
      sendWakeOnLan(
        {
          ipAddress: '192.168.1.10',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          pollIntervalSeconds: 60,
          targetOs: 'linux',
          sshUsername: 'admin',
          sshPassword: 'secret',
          sshPort: 22,
          wolBroadcastAddress: '192.168.1.255',
        },
        { logError, translate }
      )
    ).rejects.toThrow('translated:errors.startup_failed')
  })

  it('runs shutdown commands and maps ssh failures', async () => {
    const { executeShutdown } = await importFresh<
      typeof import('../device/power.mts')
    >('../device/power.mts')

    const logError = mock(() => undefined)
    const translate = (key: string) => `translated:${key}`

    await executeShutdown(
      {
        ipAddress: '192.168.1.10',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        pollIntervalSeconds: 60,
        targetOs: 'windows',
        sshUsername: 'admin',
        sshPassword: 'secret',
        sshPort: 22,
        wolBroadcastAddress: '255.255.255.255',
      },
      { logError, translate }
    )

    expect(sshExecCommand).toBe(SHUTDOWN_COMMANDS.windows)
    expect(sshExecOptions).toEqual({ pty: false })
    expect(clientEnded).toBe(true)

    sshScenario = {
      closeCode: 0,
      stdoutChunks: [`before ${SUDO_PROMPT} after`],
    }
    await executeShutdown(
      {
        ipAddress: '192.168.1.10',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        pollIntervalSeconds: 60,
        targetOs: 'linux',
        sshUsername: 'admin',
        sshPassword: 'secret',
        sshPort: 22,
        wolBroadcastAddress: '255.255.255.255',
      },
      { logError, translate }
    )

    expect(sshConnectOptions?.host).toBe('192.168.1.10')
    expect(sshExecCommand).toBe(SHUTDOWN_COMMANDS.linux)
    expect(sshStreamWrites).toEqual(['secret\n'])

    sshScenario = {
      closeCode: 1,
      stderrChunks: ['permission denied'],
    }
    await expect(
      executeShutdown(
        {
          ipAddress: '192.168.1.10',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          pollIntervalSeconds: 60,
          targetOs: 'linux',
          sshUsername: 'admin',
          sshPassword: 'secret',
          sshPort: 22,
          wolBroadcastAddress: '255.255.255.255',
        },
        { logError, translate }
      )
    ).rejects.toThrow('translated:errors.ssh_shutdown_failed')
  })
})

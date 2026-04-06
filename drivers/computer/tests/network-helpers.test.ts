import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { SHUTDOWN_COMMANDS, SUDO_PROMPT } from '../constants'
import {
  createMockDevice,
  flushAsync,
  importFresh,
  mockHomeyModule,
} from './test-helpers'

type SocketEvent = 'connect' | 'timeout' | 'error'

type SshScenario = {
  closeCode: number | null
  connectError?: Error
  execError?: Error
  stderrChunks?: string[]
  stdoutChunks?: string[]
}

let socketBehavior: SocketEvent = 'connect'
let pingError: Error | NodeJS.ErrnoException | null = null
let dgramSendError: Error | null = null
let lastSendArgs: { address: string; port: number } | undefined
let sshScenario: SshScenario = {
  closeCode: 0,
  stderrChunks: [],
  stdoutChunks: [],
}
let sshExecCommand: string | undefined
let wrotePassword = false

class FakeSocket {
  readonly listeners = new Map<string, () => void>()
  setTimeout() {}
  once(event: string, listener: () => void) {
    this.listeners.set(event, listener)
    return this
  }
  connect() {
    queueMicrotask(() => this.listeners.get(socketBehavior)?.())
  }
  destroy() {}
}

class FakeDgramSocket {
  once() {
    return this
  }
  bind(callback: () => void) {
    callback()
  }
  setBroadcast() {}
  send(
    _packet: Buffer,
    port: number,
    address: string,
    callback: (error: Error | null) => void
  ) {
    lastSendArgs = { address, port }
    callback(dgramSendError)
  }
  close() {}
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
    if (!handlers) return
    this.listeners.set(
      event,
      handlers.filter(existingHandler => existingHandler !== handler)
    )
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) handler(...args)
  }
}

class FakeClientChannel extends FakeEmitter {
  readonly stderr = new FakeEmitter()
  write(chunk: string) {
    if (chunk.includes('\n')) wrotePassword = true
  }
}

class FakeSshClient extends FakeEmitter {
  connect() {
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
    _options: Record<string, unknown>,
    callback: (error: Error | null, stream: FakeClientChannel) => void
  ) {
    sshExecCommand = command
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
  end() {}
}

describe('computer network behavior via device.mts', () => {
  beforeEach(() => {
    mock.restore()
    mockHomeyModule()
    socketBehavior = 'connect'
    pingError = null
    dgramSendError = null
    lastSendArgs = undefined
    sshScenario = { closeCode: 0, stderrChunks: [], stdoutChunks: [] }
    sshExecCommand = undefined
    wrotePassword = false

    mock.module('node:net', () => ({
      default: {
        Socket: FakeSocket,
        isIP: (value: string) =>
          /^\d+\.\d+\.\d+\.\d+$/u.test(value) ? 4 : 0,
      },
    }))
    mock.module('node:child_process', () => ({
      execFile: (
        _command: string,
        _args: string[],
        callback: (error: Error | NodeJS.ErrnoException | null) => void
      ) => queueMicrotask(() => callback(pingError)),
    }))
    mock.module('node:dgram', () => ({
      default: { createSocket: () => new FakeDgramSocket() },
    }))
    mock.module('ssh2', () => ({ Client: FakeSshClient }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('starts and shuts down through device methods', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')
    const state = createMockDevice()

    await ComputerDevice.prototype.startComputer.call(state.device as never)
    expect(lastSendArgs).toEqual({ address: '255.255.255.255', port: 9 })

    await ComputerDevice.prototype.shutdownComputer.call(state.device as never)
    expect(sshExecCommand).toBe(SHUTDOWN_COMMANDS.linux)

    sshScenario = { closeCode: 0, stdoutChunks: [`before ${SUDO_PROMPT} after`] }
    await ComputerDevice.prototype.shutdownComputer.call(state.device as never)
    expect(wrotePassword).toBe(true)

    dgramSendError = new Error('send failed')
    await expect(
      ComputerDevice.prototype.startComputer.call(state.device as never)
    ).rejects.toThrow('translated:errors.startup_failed')

    sshScenario = { closeCode: 1, stderrChunks: ['permission denied'] }
    await expect(
      ComputerDevice.prototype.shutdownComputer.call(state.device as never)
    ).rejects.toThrow('translated:errors.ssh_shutdown_failed')

    socketBehavior = 'error'
    pingError = Object.assign(new Error('missing ping'), { code: 'ENOENT' })
    await ComputerDevice.prototype.onInit.call(state.device as never)
    state.intervalTimers[0]?.callback()
    await flushAsync(10)
    expect(state.capabilities.get('alarm_connectivity')).toBe(true)
  })
})

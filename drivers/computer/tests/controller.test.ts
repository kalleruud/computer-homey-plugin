import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  SHUTDOWN_COMMANDS,
  SHUTDOWN_REFRESH_DELAY_MS,
  STARTUP_REFRESH_DELAY_MS,
} from '../constants'
import {
  createMockDevice,
  flushAsync,
  importFresh,
  mockHomeyModule,
} from './test-helpers'

type SocketMode = 'connect' | 'error' | 'throw'

type SshScenario = {
  closeCode: number | null
  connectError?: Error
  execError?: Error
  stderrChunks?: string[]
  stdoutChunks?: string[]
}

let socketMode: SocketMode = 'connect'
let socketConnectArgs: { host: string; port: number } | undefined
let pingError: Error | NodeJS.ErrnoException | null = null
let dgramSendArgs: { address: string; port: number } | undefined
let sshExecCommand: string | undefined
let sshScenario: SshScenario = {
  closeCode: 0,
  stderrChunks: [],
  stdoutChunks: [],
}

function isIpv4Address(value: string) {
  const parts = value.split('.')

  if (parts.length !== 4) {
    return false
  }

  return parts.every(part => {
    if (!/^\d+$/u.test(part)) {
      return false
    }

    const segment = Number(part)
    return segment >= 0 && segment <= 255
  })
}

class FakeSocket {
  readonly listeners = new Map<string, () => void>()

  setTimeout() {
    // Needed by probe interface.
  }

  once(event: string, listener: () => void) {
    this.listeners.set(event, listener)
    return this
  }

  connect(port: number, host: string) {
    socketConnectArgs = { host, port }

    if (socketMode === 'throw') {
      throw new Error('socket failed')
    }

    queueMicrotask(() => {
      this.listeners.get(socketMode)?.()
    })
  }

  destroy() {
    // Needed by probe cleanup.
  }
}

class FakeDgramSocket {
  once() {
    return this
  }

  bind(callback: () => void) {
    callback()
  }

  setBroadcast() {
    // Needed by WoL flow.
  }

  send(
    _packet: Buffer,
    port: number,
    address: string,
    callback: (error: Error | null) => void
  ) {
    dgramSendArgs = { address, port }
    callback(null)
  }

  close() {
    // Needed by WoL flow.
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

  write() {
    // Needed by SSH stream API.
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

  end() {
    // Needed by SSH client API.
  }
}

describe('computer controller', () => {
  beforeEach(() => {
    mock.restore()
    socketMode = 'connect'
    socketConnectArgs = undefined
    pingError = null
    dgramSendArgs = undefined
    sshExecCommand = undefined
    sshScenario = {
      closeCode: 0,
      stderrChunks: [],
      stdoutChunks: [],
    }

    mockHomeyModule()
    mock.module('node:net', () => ({
      default: {
        Socket: FakeSocket,
        isIP: (value: string) => (isIpv4Address(value) ? 4 : 0),
      },
    }))
    mock.module('node:child_process', () => ({
      execFile: (
        _command: string,
        _args: string[],
        callback: (error: Error | NodeJS.ErrnoException | null) => void
      ) => {
        queueMicrotask(() => callback(pingError))
      },
    }))
    mock.module('node:dgram', () => ({
      default: {
        createSocket: () => new FakeDgramSocket(),
      },
    }))
    mock.module('ssh2', () => ({
      Client: FakeSshClient,
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('initializes the device and starts online polling', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')
    const state = createMockDevice({
      capabilities: {
        onoff: false,
      },
    })

    await ComputerDevice.prototype.onInit.call(state.device as never)
    await flushAsync()

    expect(state.device.addCapability).toHaveBeenCalledWith(
      'alarm_connectivity'
    )
    expect(state.device.registerCapabilityListener).toHaveBeenCalledWith(
      'onoff',
      expect.any(Function)
    )
    expect(state.intervalTimers[0]?.delayMs).toBe(60_000)
    expect(socketConnectArgs).toEqual({ host: '192.168.1.2', port: 22 })
    expect(state.device.setCapabilityValue).toHaveBeenCalledWith('onoff', true)
  })

  it('skips overlapping polls and runs scheduled refresh callbacks', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')
    const state = createMockDevice({
      capabilities: {
        onoff: false,
        alarm_connectivity: false,
      },
    })

    await ComputerDevice.prototype.onInit.call(state.device as never)
    state.intervalTimers[0]?.callback()
    await flushAsync(10)

    expect(state.capabilities.get('onoff')).toBe(true)

    await ComputerDevice.prototype.startComputer.call(state.device as never)
    state.timeoutTimers.at(-1)?.callback()
    await flushAsync(10)

    expect(state.capabilities.get('onoff')).toBe(true)
  })

  it('applies validation warnings and ping fallback results', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')

    const invalidState = createMockDevice({
      capabilities: {
        onoff: true,
        alarm_connectivity: false,
      },
      settings: {
        ip_address: 'invalid-ip',
      },
    })

    await expect(
      ComputerDevice.prototype.onSettings.call(invalidState.device as never, {
        changedKeys: ['ip_address'],
        newSettings: {},
        oldSettings: {},
      })
    ).resolves.toBe('translated:messages.settings_updated')
    await flushAsync()

    expect(invalidState.device.setWarning).toHaveBeenCalledWith(
      'translated:errors.invalid_ip_address'
    )

    const fallbackState = createMockDevice({
      capabilities: {
        onoff: false,
        alarm_connectivity: false,
      },
    })

    await ComputerDevice.prototype.onInit.call(fallbackState.device as never)
    await flushAsync()

    socketMode = 'error'
    fallbackState.intervalTimers[0]?.callback()
    await flushAsync(10)

    expect(fallbackState.device.setWarning).toHaveBeenCalledWith(
      'translated:warnings.ssh_unavailable'
    )
    expect(fallbackState.capabilities.get('alarm_connectivity')).toBe(true)
    expect(fallbackState.capabilities.get('onoff')).toBe(true)
  })

  it('handles offline probes, poll errors, and refresh scheduling', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')
    const state = createMockDevice({
      capabilities: {
        onoff: true,
        alarm_connectivity: false,
      },
    })

    await ComputerDevice.prototype.onInit.call(state.device as never)
    await flushAsync()

    socketMode = 'error'
    pingError = new Error('ping failed')
    state.intervalTimers[0]?.callback()
    await flushAsync(10)

    expect(state.capabilities.get('alarm_connectivity')).toBe(true)
    expect(state.capabilities.get('onoff')).toBe(false)

    socketMode = 'throw'
    state.capabilities.set('onoff', true)
    state.intervalTimers[0]?.callback()
    await flushAsync(10)
    expect(state.device.error).toHaveBeenCalledWith(
      'Failed to poll the computer status',
      expect.any(Error)
    )
    expect(state.capabilities.get('onoff')).toBe(true)

    const listener = state.capabilityListeners.get('onoff')
    await listener?.(true)
    await listener?.(false)

    expect(dgramSendArgs).toEqual({
      address: '255.255.255.255',
      port: 9,
    })
    expect(sshExecCommand).toBe(SHUTDOWN_COMMANDS.linux)
    expect(state.timeoutTimers[0]?.delayMs).toBe(STARTUP_REFRESH_DELAY_MS)
    expect(state.timeoutTimers[1]?.delayMs).toBe(SHUTDOWN_REFRESH_DELAY_MS)

    ComputerDevice.prototype.onDeleted.call(state.device as never)
    expect(state.homey.clearInterval).toHaveBeenCalled()
    expect(state.homey.clearTimeout).toHaveBeenCalled()
  })

  it('logs lifecycle events and supports explicit uninit polling stop', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')
    const state = createMockDevice()

    await ComputerDevice.prototype.onInit.call(state.device as never)
    ComputerDevice.prototype.onAdded.call(state.device as never)
    ComputerDevice.prototype.onRenamed.call(state.device as never, 'Office PC')
    await ComputerDevice.prototype.onUninit.call(state.device as never)

    expect(state.device.log).toHaveBeenCalledWith(
      'Computer device has been added'
    )
    expect(state.device.log).toHaveBeenCalledWith(
      'Computer device was renamed to',
      'Office PC'
    )
    expect(state.homey.clearInterval).toHaveBeenCalled()
  })
})

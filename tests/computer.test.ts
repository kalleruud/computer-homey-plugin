import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'node:events'

process.env.DEBUG = '1'

type TcpOutcome = 'connect' | 'timeout' | 'error'

type PingError = Error & {
  code?: string
}

type SshScenario = {
  closeCode?: number | null
  connectError?: Error
  execError?: Error
  stderrChunks?: string[]
  stdoutChunks?: string[]
  streamError?: Error
}

type TimerEntry = {
  callback: () => void | Promise<void>
  id: symbol
  ms: number
}

type RecordedPacket = {
  address: string
  packet: Buffer
  port: number
}

type SshConnectConfig = {
  host: string
  keepaliveCountMax: number
  keepaliveInterval: number
  password: string
  port: number
  readyTimeout: number
  username: string
}

type SshExecCall = {
  command: string
  options: {
    pty: boolean
  }
}

type RuntimeState = {
  bindCount: number
  boundSockets: number
  broadcastCalls: boolean[]
  defaultUuid: string
  destroyedSockets: number
  dgramSendError?: Error
  ipChecks: string[]
  pingCalls: Array<{
    args: string[]
    file: string
  }>
  pingOutcomes: Array<PingError | null>
  sentPackets: RecordedPacket[]
  setTimeoutValues: number[]
  sshConnectConfigs: SshConnectConfig[]
  sshEndCount: number
  sshExecCalls: SshExecCall[]
  sshScenarios: SshScenario[]
  sshWrites: string[]
  tcpCalls: Array<{
    host: string
    port: number
  }>
  tcpOutcomes: TcpOutcome[]
}

const runtime: RuntimeState = {
  bindCount: 0,
  boundSockets: 0,
  broadcastCalls: [],
  defaultUuid: 'uuid-1',
  destroyedSockets: 0,
  ipChecks: [],
  pingCalls: [],
  pingOutcomes: [],
  sentPackets: [],
  setTimeoutValues: [],
  sshConnectConfigs: [],
  sshEndCount: 0,
  sshExecCalls: [],
  sshScenarios: [],
  sshWrites: [],
  tcpCalls: [],
  tcpOutcomes: [],
}

function resetRuntime() {
  runtime.bindCount = 0
  runtime.boundSockets = 0
  runtime.broadcastCalls = []
  runtime.defaultUuid = 'uuid-1'
  runtime.destroyedSockets = 0
  runtime.dgramSendError = undefined
  runtime.ipChecks = []
  runtime.pingCalls = []
  runtime.pingOutcomes = []
  runtime.sentPackets = []
  runtime.setTimeoutValues = []
  runtime.sshConnectConfigs = []
  runtime.sshEndCount = 0
  runtime.sshExecCalls = []
  runtime.sshScenarios = []
  runtime.sshWrites = []
  runtime.tcpCalls = []
  runtime.tcpOutcomes = []
}

function isIPv4(value: string): number {
  runtime.ipChecks.push(value)

  const octets = value.split('.')
  if (octets.length !== 4) {
    return 0
  }

  const numbers = octets.map(Number)
  if (
    numbers.some(number => Number.isNaN(number) || number < 0 || number > 255)
  ) {
    return 0
  }

  return 4
}

class FakeNetSocket extends EventEmitter {
  override once(
    event: 'connect' | 'timeout' | 'error',
    listener: () => void
  ): this {
    return super.once(event, listener)
  }

  connect(port: number, host: string) {
    runtime.tcpCalls.push({ host, port })
    const outcome = runtime.tcpOutcomes.shift() ?? 'connect'

    queueMicrotask(() => {
      this.emit(outcome)
    })
  }

  destroy() {
    runtime.destroyedSockets += 1
  }

  setTimeout(ms: number) {
    runtime.setTimeoutValues.push(ms)
  }
}

class FakeDgramSocket extends EventEmitter {
  bind(callback: () => void) {
    runtime.bindCount += 1
    runtime.boundSockets += 1
    queueMicrotask(callback)
  }

  close() {
    runtime.boundSockets -= 1
  }

  send(
    packet: Buffer,
    port: number,
    address: string,
    callback: (error?: Error | null) => void
  ) {
    runtime.sentPackets.push({
      address,
      packet: Buffer.from(packet),
      port,
    })

    queueMicrotask(() => {
      callback(runtime.dgramSendError)
    })
  }

  setBroadcast(enabled: boolean) {
    runtime.broadcastCalls.push(enabled)
  }
}

class FakeSshStream extends EventEmitter {
  stderr = new EventEmitter()

  write(data: string) {
    runtime.sshWrites.push(data)
  }
}

class FakeSshClient extends EventEmitter {
  private scenario: SshScenario | undefined

  connect(config: SshConnectConfig) {
    runtime.sshConnectConfigs.push(config)
    this.scenario = runtime.sshScenarios.shift() ?? { closeCode: 0 }

    queueMicrotask(() => {
      if (this.scenario?.connectError) {
        this.emit('error', this.scenario.connectError)
        return
      }

      this.emit('ready')
    })
  }

  end() {
    runtime.sshEndCount += 1
  }

  exec(
    command: string,
    options: { pty: boolean },
    callback: (error?: Error | null, stream?: FakeSshStream) => void
  ) {
    runtime.sshExecCalls.push({ command, options })

    if (this.scenario?.execError) {
      queueMicrotask(() => {
        callback(this.scenario?.execError)
      })
      return
    }

    const stream = new FakeSshStream()
    callback(undefined, stream)

    queueMicrotask(() => {
      if (this.scenario?.streamError) {
        stream.emit('error', this.scenario.streamError)
        return
      }

      for (const chunk of this.scenario?.stdoutChunks ?? []) {
        stream.emit('data', Buffer.from(chunk))
      }

      for (const chunk of this.scenario?.stderrChunks ?? []) {
        stream.stderr.emit('data', Buffer.from(chunk))
      }

      stream.emit('close', this.scenario?.closeCode ?? 0)
    })
  }
}

type FakeSettings = Record<string, unknown>

type FakeHomeyRuntime = {
  clearInterval: (id: symbol) => void
  clearTimeout: (id: symbol) => void
  intervals: Map<symbol, TimerEntry>
  setInterval: (callback: () => void | Promise<void>, ms: number) => symbol
  setTimeout: (callback: () => void | Promise<void>, ms: number) => symbol
  timeouts: Map<symbol, TimerEntry>
}

function createHomeyRuntime(): FakeHomeyRuntime {
  const intervals = new Map<symbol, TimerEntry>()
  const timeouts = new Map<symbol, TimerEntry>()

  return {
    clearInterval(id) {
      intervals.delete(id)
    },
    clearTimeout(id) {
      timeouts.delete(id)
    },
    intervals,
    setInterval(callback, ms) {
      const id = Symbol(`interval:${ms.toString()}`)
      intervals.set(id, { callback, id, ms })
      return id
    },
    setTimeout(callback, ms) {
      const id = Symbol(`timeout:${ms.toString()}`)
      timeouts.set(id, { callback, id, ms })
      return id
    },
    timeouts,
  }
}

class FakeApp {
  logs: unknown[][] = []

  log(...args: unknown[]) {
    this.logs.push(args)
  }
}

class FakeDriver {
  devices: unknown[] = []
  logs: unknown[][] = []

  getDevices() {
    return this.devices
  }

  log(...args: unknown[]) {
    this.logs.push(args)
  }
}

class FakeDevice {
  capabilities: string[] = []
  capabilityListeners = new Map<string, () => Promise<void> | void>()
  capabilitySetCalls: Array<{
    capability: string
    value: number | boolean
  }> = []
  capabilityValues = new Map<string, number | boolean>()
  errorCalls: unknown[][] = []
  homey = createHomeyRuntime()
  logs: unknown[][] = []
  settings: FakeSettings = {}
  unsetWarningCalls = 0
  warning?: string
  warningCalls: string[] = []

  async addCapability(capability: string) {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability)
    }
  }

  error(...args: unknown[]) {
    this.errorCalls.push(args)
  }

  getCapabilities() {
    return [...this.capabilities]
  }

  getCapabilityValue(capability: string) {
    return this.capabilityValues.get(capability)
  }

  getSettings() {
    return this.settings
  }

  hasCapability(capability: string) {
    return this.capabilities.includes(capability)
  }

  log(...args: unknown[]) {
    this.logs.push(args)
  }

  registerCapabilityListener(
    capability: string,
    listener: () => Promise<void> | void
  ) {
    this.capabilityListeners.set(capability, listener)
  }

  async removeCapability(capability: string) {
    this.capabilities = this.capabilities.filter(
      currentCapability => currentCapability !== capability
    )
  }

  async setCapabilityValue(capability: string, value: number | boolean) {
    this.capabilitySetCalls.push({ capability, value })
    this.capabilityValues.set(capability, value)
  }

  async setWarning(warning: string) {
    this.warningCalls.push(warning)
    this.warning = warning
  }

  async unsetWarning() {
    this.unsetWarningCalls += 1
    this.warning = undefined
  }
}

mock.module('homey', () => ({
  default: {
    App: FakeApp,
    Device: FakeDevice,
    Driver: FakeDriver,
  },
}))

mock.module('node:crypto', () => ({
  randomUUID: () => runtime.defaultUuid,
}))

mock.module('node:child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    callback: (error: PingError | null) => void
  ) => {
    runtime.pingCalls.push({ args, file })
    queueMicrotask(() => {
      callback(runtime.pingOutcomes.shift() ?? null)
    })
  },
}))

mock.module('node:dgram', () => ({
  createSocket: () => new FakeDgramSocket(),
  default: {
    createSocket: () => new FakeDgramSocket(),
  },
}))

mock.module('node:net', () => ({
  Socket: FakeNetSocket,
  default: {
    Socket: FakeNetSocket,
    isIP: isIPv4,
  },
  isIP: isIPv4,
}))

mock.module('ssh2', () => ({
  Client: FakeSshClient,
}))

const { default: ComputerDevice } =
  await import('../drivers/computer/device.mts')
const { default: ComputerDriver } =
  await import('../drivers/computer/driver.mts')

const SHUTDOWN_COMMANDS = {
  linux: 'sudo -S -p "[sudo] password:" shutdown -h now',
  windows: 'shutdown /s /t 0',
} as const

function createDevice(settings: FakeSettings = {}) {
  const device = new ComputerDevice() as unknown as FakeDevice & {
    onAdded: () => void
    onDeleted: () => void
    onInit: () => Promise<void>
    onRenamed: (name: string) => void
    onSettings: (event: { changedKeys: string[] }) => Promise<void>
    onUninit: () => Promise<void>
    shutdownComputer: () => Promise<void>
    startComputer: () => Promise<void>
  }

  device.settings = settings

  return device
}

function getOnlyInterval(device: FakeDevice) {
  const [entry] = [...device.homey.intervals.values()]

  expect(entry).toBeDefined()

  return entry as TimerEntry
}

async function runScheduledPoll(device: FakeDevice) {
  const timer = getOnlyInterval(device)
  timer.callback()
  await Bun.sleep(0)
}

beforeEach(() => {
  resetRuntime()
})

describe('ComputerDriver', () => {
  it('logs when the driver initializes', async () => {
    const driver = new ComputerDriver() as unknown as FakeDriver & {
      onInit: () => Promise<void>
    }

    await driver.onInit()

    expect(driver.logs).toContainEqual(['Computer driver has been initialized'])
  })

  it('creates a predictable default pair device name', async () => {
    const driver = new ComputerDriver() as unknown as FakeDriver & {
      onPairListDevices: () => Promise<
        Array<{ data: { id: string }; name: string }>
      >
    }

    driver.devices = [{}, {}]
    runtime.defaultUuid = 'uuid-3'

    const devices = await driver.onPairListDevices()

    expect(devices).toEqual([
      {
        data: {
          id: 'uuid-3',
        },
        name: 'Computer 3',
      },
    ])
  })
})

describe('ComputerDevice', () => {
  it('initializes capabilities, listeners, and polling through device.mts', async () => {
    const device = createDevice({
      ipAddress: ' 192.168.1.20 ',
      macAddress: ' AA-BB-CC-DD-EE-FF ',
      pollIntervalSeconds: 2,
      sshPassword: 'secret',
      sshPort: 22.9,
      sshUsername: 'admin',
      targetOs: 'linux',
    })

    device.capabilities = ['poweron', 'legacy']
    runtime.tcpOutcomes = ['connect', 'connect']

    await device.onInit()

    expect(device.logs).toContainEqual(['Computer device has been initialized'])
    expect(device.logs).toContainEqual(['Removed unused capability: legacy'])
    expect([...device.capabilityListeners.keys()]).toEqual([
      'poweron',
      'poweroff',
    ])
    expect([...device.capabilities].sort()).toEqual([
      'connected',
      'poweroff',
      'poweron',
      'uptime',
    ])
    expect(getOnlyInterval(device).ms).toBe(10_000)
    expect(device.getCapabilityValue('connected')).toBe(true)
    expect(device.getCapabilityValue('uptime')).toBe(0)
    expect(device.warning).toBeUndefined()
    expect(device.unsetWarningCalls).toBe(1)

    const initialUpdates = [...device.capabilitySetCalls]
    expect(initialUpdates).toEqual([
      { capability: 'connected', value: true },
      { capability: 'uptime', value: 0 },
    ])

    const initialNow = Date.now
    Date.now = () => initialNow() + 120_000

    try {
      await runScheduledPoll(device)
    } finally {
      Date.now = initialNow
    }

    expect(device.capabilitySetCalls).toEqual([
      { capability: 'connected', value: true },
      { capability: 'uptime', value: 0 },
      { capability: 'uptime', value: 2 },
    ])
    expect(runtime.tcpCalls).toEqual([
      { host: '192.168.1.20', port: 22 },
      { host: '192.168.1.20', port: 22 },
    ])
    expect(runtime.setTimeoutValues).toEqual([3000, 3000])
    expect(runtime.broadcastCalls).toEqual([])
  })

  it('restarts polling when settings change and surfaces validation warnings', async () => {
    const device = createDevice({
      ipAddress: '192.168.1.20',
      pollIntervalSeconds: 'fast',
      sshPort: 22,
    })

    runtime.tcpOutcomes = ['connect']
    await device.onInit()

    const firstIntervalId = getOnlyInterval(device).id
    device.settings = {
      ipAddress: '192.168.1.20',
      pollIntervalSeconds: 99999,
      sshPort: 70_000,
    }

    await device.onSettings({ changedKeys: ['ipAddress', 'sshPort'] })

    expect(device.logs).toContainEqual([
      'Computer settings changed',
      ['ipAddress', 'sshPort'],
    ])
    expect(device.warning).toBe('SSH port must be between 1 and 65535.')
    expect(device.getCapabilityValue('connected')).toBe(false)
    expect(getOnlyInterval(device).ms).toBe(3_600_000)
    expect(device.homey.intervals.has(firstIntervalId)).toBe(false)
  })

  it('uses ping fallback and only logs a missing ping command once', async () => {
    const device = createDevice({
      ipAddress: '192.168.1.20',
      sshPort: 22,
    })

    runtime.tcpOutcomes = ['timeout', 'error', 'error']
    runtime.pingOutcomes = [
      null,
      Object.assign(new Error('ping missing'), { code: 'ENOENT' }),
      Object.assign(new Error('ping missing'), { code: 'ENOENT' }),
    ]

    await device.onInit()
    expect(device.warning).toBe(
      'Computer is reachable, but SSH is unavailable.'
    )
    expect(device.getCapabilityValue('connected')).toBe(true)

    await runScheduledPoll(device)
    await runScheduledPoll(device)

    const pingMissingErrors = device.errorCalls.filter(
      ([message]) =>
        message === 'Ping command is not available for fallback status checks'
    )

    expect(runtime.pingCalls).toEqual([
      { args: ['-c', '1', '-W', '1', '192.168.1.20'], file: 'ping' },
      { args: ['-c', '1', '-W', '1', '192.168.1.20'], file: 'ping' },
      { args: ['-c', '1', '-W', '1', '192.168.1.20'], file: 'ping' },
    ])
    expect(pingMissingErrors).toHaveLength(1)
    expect(device.warning).toBeUndefined()
    expect(device.getCapabilityValue('connected')).toBe(false)
  })

  it('sends wake-on-lan packets through the registered capability listener', async () => {
    const device = createDevice({
      ipAddress: '192.168.10.42',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      sshPort: 22,
    })

    runtime.tcpOutcomes = ['connect']
    await device.onInit()

    await device.capabilityListeners.get('poweron')?.()

    expect(runtime.bindCount).toBe(1)
    expect(runtime.broadcastCalls).toEqual([true])
    expect(runtime.sentPackets).toHaveLength(1)
    expect(runtime.sentPackets[0]).toMatchObject({
      address: '192.168.10.255',
      port: 9,
    })
    expect(runtime.sentPackets[0]?.packet).toHaveLength(102)
  })

  it('wraps wake-on-lan transport failures with a device-level error', async () => {
    const device = createDevice({
      ipAddress: '192.168.10.42',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      sshPort: 22,
    })

    runtime.dgramSendError = new Error('send failed')

    await expect(device.startComputer()).rejects.toThrow(
      'Failed to send the Wake-on-LAN packet.'
    )
    expect(device.errorCalls).toContainEqual([
      'Failed to send a Wake-on-LAN packet',
      runtime.dgramSendError,
    ])
  })

  it('validates wake-on-lan settings before sending packets', async () => {
    const device = createDevice({
      ipAddress: 'not-an-ip',
      macAddress: 'invalid',
    })

    await expect(device.startComputer()).rejects.toThrow(
      'Computer IP must be a valid IPv4 address.'
    )

    device.settings = {
      ipAddress: '192.168.10.42',
      macAddress: 'invalid',
    }

    await expect(device.startComputer()).rejects.toThrow(
      'Computer MAC must be a valid MAC address.'
    )
  })

  it('runs linux shutdown over ssh and sends the sudo password once', async () => {
    const device = createDevice({
      ipAddress: '192.168.1.20',
      sshPassword: 'secret',
      sshPort: 22.9,
      sshUsername: ' admin ',
      targetOs: 'linux',
    })

    runtime.sshScenarios = [
      {
        closeCode: 0,
        stderrChunks: ['[sudo] password:'],
      },
    ]

    await device.shutdownComputer()

    expect(runtime.sshConnectConfigs).toEqual([
      {
        host: '192.168.1.20',
        keepaliveCountMax: 2,
        keepaliveInterval: 2000,
        password: 'secret',
        port: 22,
        readyTimeout: 10_000,
        username: 'admin',
      },
    ])
    expect(runtime.sshExecCalls).toEqual([
      {
        command: SHUTDOWN_COMMANDS.linux,
        options: { pty: true },
      },
    ])
    expect(runtime.sshWrites).toEqual(['secret\n'])
    expect(runtime.sshEndCount).toBe(1)
  })

  it('defaults unknown target operating systems to linux and windows avoids sudo', async () => {
    const linuxDevice = createDevice({
      ipAddress: '192.168.1.20',
      sshPassword: 'secret',
      sshPort: 22,
      sshUsername: 'admin',
      targetOs: 'bsd',
    })

    runtime.sshScenarios = [{ closeCode: 0 }]
    await linuxDevice.shutdownComputer()

    const windowsDevice = createDevice({
      ipAddress: '192.168.1.21',
      sshPassword: 'secret',
      sshPort: 22,
      sshUsername: 'admin',
      targetOs: 'windows',
    })

    runtime.sshScenarios = [{ closeCode: 0 }]
    await windowsDevice.shutdownComputer()

    expect(runtime.sshExecCalls).toEqual([
      {
        command: SHUTDOWN_COMMANDS.linux,
        options: { pty: true },
      },
      {
        command: SHUTDOWN_COMMANDS.windows,
        options: { pty: false },
      },
    ])
    expect(runtime.sshWrites).toEqual([])
  })

  it('wraps ssh shutdown failures with a user-facing device error', async () => {
    const device = createDevice({
      ipAddress: '192.168.1.20',
      sshPassword: 'secret',
      sshPort: 22,
      sshUsername: 'admin',
      targetOs: 'linux',
    })

    runtime.sshScenarios = [
      {
        closeCode: 1,
        stderrChunks: ['permission denied'],
      },
    ]

    await expect(device.shutdownComputer()).rejects.toThrow(
      'Failed to shut down the computer over SSH.'
    )
    expect(device.errorCalls).toContainEqual([
      'Failed to shut down the computer over SSH',
      expect.any(Error),
    ])
  })

  it('validates ssh shutdown settings before opening a connection', async () => {
    const device = createDevice({
      ipAddress: '192.168.1.20',
      sshPassword: 'secret',
      sshPort: 22,
      sshUsername: '',
    })

    await expect(device.shutdownComputer()).rejects.toThrow(
      'SSH username is required for shutdown.'
    )

    device.settings = {
      ipAddress: '192.168.1.20',
      sshPassword: '',
      sshPort: 22,
      sshUsername: 'admin',
    }

    await expect(device.shutdownComputer()).rejects.toThrow(
      'SSH password is required for shutdown.'
    )
  })

  it('logs lifecycle events and stops polling when the device is removed', async () => {
    const device = createDevice({
      ipAddress: '192.168.1.20',
      sshPort: 22,
    })

    runtime.tcpOutcomes = ['connect']
    await device.onInit()

    device.onAdded()
    device.onRenamed('Office Computer')
    device.onDeleted()
    await device.onUninit()

    expect(device.logs).toContainEqual(['Computer device has been added'])
    expect(device.logs).toContainEqual([
      'Computer device was renamed to',
      'Office Computer',
    ])
    expect(device.logs).toContainEqual(['Computer device has been deleted'])
    expect(device.logs).toContainEqual([
      'Computer device has been uninitialized',
    ])
    expect(device.homey.intervals.size).toBe(0)
  })
})

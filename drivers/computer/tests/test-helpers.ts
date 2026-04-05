import { mock } from 'bun:test'

type TimerRecord = {
  callback: () => void
  delayMs: number
  timer: NodeJS.Timeout
}

type CapabilityListener = (value: boolean) => Promise<void> | void

type MockDeviceOptions = {
  capabilities?: Record<string, boolean>
  settings?: Record<string, unknown>
  translator?: (key: string) => string
}

export const defaultRawSettings = {
  ip_address: '192.168.1.2',
  mac_address: 'aa:bb:cc:dd:ee:ff',
  poll_interval: 60,
  target_os: 'linux',
  ssh_username: 'ruud',
  ssh_password: 'secret',
  ssh_port: 22,
  wol_broadcast_address: '255.255.255.255',
} satisfies Record<string, unknown>

export function mockHomeyModule() {
  mock.module('homey', () => ({
    default: {
      Driver: class Driver {},
      Device: class Device {},
    },
  }))
}

export async function importFresh<TModule>(relativePath: string) {
  const moduleUrl = new URL(relativePath, import.meta.url)
  return import(
    `${moduleUrl.href}?test=${Date.now().toString()}-${Math.random().toString(16)}`
  ) as Promise<TModule>
}

export async function flushAsync(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

export function createMockDriverContext(deviceCount = 0) {
  const actionCards = new Map<
    string,
    {
      registerRunListener: ReturnType<typeof mock>
      runListener?: (args: { device: unknown }) => Promise<boolean>
    }
  >()

  const flow = {
    getActionCard: mock((id: string) => {
      const existingCard = actionCards.get(id)

      if (existingCard) {
        return existingCard
      }

      const card = {
        registerRunListener: mock(
          (listener: (args: { device: unknown }) => Promise<boolean>) => {
            card.runListener = listener
            return card
          }
        ),
        runListener: undefined as
          | ((args: { device: unknown }) => Promise<boolean>)
          | undefined,
      }

      actionCards.set(id, card)
      return card
    }),
  }

  return {
    actionCards,
    context: {
      homey: { flow },
      getDevices: mock(() => Array.from({ length: deviceCount }, () => ({}))),
      log: mock(() => undefined),
    },
  }
}

export function createMockDevice(options: MockDeviceOptions = {}) {
  const capabilities = new Map(
    Object.entries({
      onoff: false,
      ...options.capabilities,
    })
  )
  const capabilityListeners = new Map<string, CapabilityListener>()
  const intervalTimers: TimerRecord[] = []
  const timeoutTimers: TimerRecord[] = []

  const homey = {
    __: options.translator ?? ((key: string) => `translated:${key}`),
    setInterval: mock((callback: () => void, delayMs: number) => {
      const timer = { kind: 'interval', delayMs } as unknown as NodeJS.Timeout
      intervalTimers.push({ callback, delayMs, timer })
      return timer
    }),
    clearInterval: mock((timer: NodeJS.Timeout) => {
      void timer
    }),
    setTimeout: mock((callback: () => void, delayMs: number) => {
      const timer = { kind: 'timeout', delayMs } as unknown as NodeJS.Timeout
      timeoutTimers.push({ callback, delayMs, timer })
      return timer
    }),
    clearTimeout: mock((timer: NodeJS.Timeout) => {
      void timer
    }),
  }

  const device = {
    homey,
    getSettings: mock(() => ({
      ...defaultRawSettings,
      ...options.settings,
    })),
    hasCapability: mock((capability: string) => capabilities.has(capability)),
    addCapability: mock(async (capability: string) => {
      capabilities.set(capability, false)
    }),
    registerCapabilityListener: mock(
      (capability: string, listener: CapabilityListener) => {
        capabilityListeners.set(capability, listener)
      }
    ),
    getCapabilityValue: mock((capability: string) =>
      capabilities.get(capability)
    ),
    setCapabilityValue: mock(async (capability: string, value: boolean) => {
      capabilities.set(capability, value)
    }),
    setWarning: mock(async (warning: string) => {
      void warning
    }),
    unsetWarning: mock(async () => undefined),
    log: mock((...args: unknown[]) => {
      void args
    }),
    error: mock((...args: unknown[]) => {
      void args
    }),
  }

  return {
    capabilities,
    capabilityListeners,
    device,
    homey,
    intervalTimers,
    timeoutTimers,
  }
}

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import {
  createMockDriverContext,
  importFresh,
  mockHomeyModule,
} from './test-helpers'

describe('computer driver', () => {
  beforeEach(() => {
    mock.restore()
    mockHomeyModule()
    mock.module('node:crypto', () => ({
      randomUUID: () => 'test-uuid',
    }))
  })

  afterEach(() => {
    mock.restore()
  })

  it('names paired devices based on the current device count', async () => {
    const { context } = createMockDriverContext(0)
    const { default: ComputerDriver } =
      await importFresh<typeof import('../driver.mts')>('../driver.mts')

    await expect(
      ComputerDriver.prototype.onPairListDevices.call(context)
    ).resolves.toEqual([
      {
        name: 'Computer',
        data: { id: 'test-uuid' },
      },
    ])

    const laterContext = createMockDriverContext(2).context
    await expect(
      ComputerDriver.prototype.onPairListDevices.call(laterContext)
    ).resolves.toEqual([
      {
        name: 'Computer 3',
        data: { id: 'test-uuid' },
      },
    ])
  })

  it('initializes and logs driver startup', async () => {
    const { default: ComputerDriver } =
      await importFresh<typeof import('../driver.mts')>('../driver.mts')
    const driver = new ComputerDriver()
    ;(driver as unknown as { log: ReturnType<typeof mock> }).log = mock(
      () => undefined
    )

    await expect(driver.onInit()).resolves.toBe(undefined)
    expect(
      (driver as unknown as { log: ReturnType<typeof mock> }).log
    ).toHaveBeenCalledWith('Computer driver has been initialized')
  })
})

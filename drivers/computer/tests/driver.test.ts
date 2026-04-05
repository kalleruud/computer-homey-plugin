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

  it('registers start and shutdown flow listeners', async () => {
    const { context, actionCards } = createMockDriverContext()
    const { default: ComputerDriver } =
      await importFresh<typeof import('../driver.mts')>('../driver.mts')

    await ComputerDriver.prototype.onInit.call(context)

    const startCard = actionCards.get('start_computer')
    const shutdownCard = actionCards.get('shutdown_computer')

    expect(startCard?.registerRunListener).toHaveBeenCalledTimes(1)
    expect(shutdownCard?.registerRunListener).toHaveBeenCalledTimes(1)

    const startComputer = mock(async () => undefined)
    const shutdownComputer = mock(async () => undefined)

    await expect(
      startCard?.runListener?.({
        device: { startComputer, shutdownComputer },
      })
    ).resolves.toBe(true)
    await expect(
      shutdownCard?.runListener?.({
        device: { startComputer, shutdownComputer },
      })
    ).resolves.toBe(true)

    expect(startComputer).toHaveBeenCalledTimes(1)
    expect(shutdownComputer).toHaveBeenCalledTimes(1)
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
})

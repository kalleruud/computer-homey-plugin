import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { createMockDevice, importFresh, mockHomeyModule } from './test-helpers'

describe('computer device settings validation', () => {
  beforeEach(() => {
    mock.restore()
    mockHomeyModule()
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns translated validation error on invalid settings updates', async () => {
    const { default: ComputerDevice } =
      await importFresh<typeof import('../device.mts')>('../device.mts')

    const state = createMockDevice({
      settings: {
        ip_address: 'invalid-ip',
      },
    })

    await expect(
      ComputerDevice.prototype.onSettings.call(state.device as never, {
        changedKeys: ['ip_address'],
        newSettings: {},
        oldSettings: {},
      })
    ).resolves.toBe('translated:messages.settings_updated')

    expect(state.device.setWarning).toHaveBeenCalledWith(
      'translated:errors.invalid_ip_address'
    )
  })
})

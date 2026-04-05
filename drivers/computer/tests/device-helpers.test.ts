import { describe, expect, it } from 'bun:test'

import { DEFAULTS, MIN_POLL_INTERVAL_SECONDS } from '../constants'
import {
  assertCanShutdown,
  assertCanWake,
  getProbeValidationError,
  getShutdownCommand,
  parseMacAddress,
} from '../device/device-validation.mjs'
import { getComputerSettings, getPollIntervalMs } from '../device/settings.mjs'

const translate = (key: string) => key

describe('computer device helpers', () => {
  it('normalizes settings and clamps the poll interval', () => {
    const settings = getComputerSettings({
      ip_address: ' 192.168.1.10 ',
      mac_address: ' aa-bb-cc-dd-ee-ff ',
      poll_interval: Number.NaN,
      target_os: 'unsupported',
      ssh_username: ' admin ',
      ssh_password: ' secret ',
      ssh_port: Number.POSITIVE_INFINITY,
      wol_broadcast_address: ' ',
    })

    expect(settings).toEqual({
      ipAddress: '192.168.1.10',
      macAddress: 'aa-bb-cc-dd-ee-ff',
      pollIntervalSeconds: DEFAULTS.POLL_INTERVAL_SECONDS,
      targetOs: 'linux',
      sshUsername: 'admin',
      sshPassword: 'secret',
      sshPort: DEFAULTS.SSH_PORT,
      wolBroadcastAddress: DEFAULTS.WOL_BROADCAST_ADDRESS,
    })

    expect(
      getPollIntervalMs({
        ...settings,
        pollIntervalSeconds: MIN_POLL_INTERVAL_SECONDS - 5,
      })
    ).toBe(MIN_POLL_INTERVAL_SECONDS * 1000)
  })

  it('validates probe settings, wake settings and shutdown credentials', () => {
    expect(
      getProbeValidationError(
        {
          ipAddress: 'not-an-ip',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          pollIntervalSeconds: 60,
          targetOs: 'linux',
          sshUsername: 'admin',
          sshPassword: 'secret',
          sshPort: 22,
          wolBroadcastAddress: '255.255.255.255',
        },
        translate
      )
    ).toBe('errors.invalid_ip_address')

    expect(() =>
      assertCanWake(
        {
          ipAddress: '192.168.1.25',
          macAddress: 'invalid',
          pollIntervalSeconds: 60,
          targetOs: 'linux',
          sshUsername: 'admin',
          sshPassword: 'secret',
          sshPort: 22,
          wolBroadcastAddress: '255.255.255.255',
        },
        translate
      )
    ).toThrow('errors.invalid_mac_address')

    expect(() =>
      assertCanShutdown(
        {
          ipAddress: '192.168.1.25',
          macAddress: 'aa:bb:cc:dd:ee:ff',
          pollIntervalSeconds: 60,
          targetOs: 'linux',
          sshUsername: '',
          sshPassword: 'secret',
          sshPort: 22,
          wolBroadcastAddress: '255.255.255.255',
        },
        translate
      )
    ).toThrow('errors.missing_ssh_username')
  })

  it('returns shutdown commands and parses mac addresses', () => {
    expect(getShutdownCommand('windows')).toBe('shutdown /s /t 0')
    expect(getShutdownCommand('linux')).toContain('shutdown -h now')
    expect(getShutdownCommand('macos')).toContain('shutdown -h now')

    expect(parseMacAddress('aa-bb-cc-dd-ee-ff', translate)).toEqual(
      Buffer.from('aabbccddeeff', 'hex')
    )
    expect(() => parseMacAddress('12345', translate)).toThrow(
      'errors.invalid_mac_address'
    )
  })
})

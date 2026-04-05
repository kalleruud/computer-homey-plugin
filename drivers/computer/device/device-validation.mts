import net from 'node:net'

import { SUDO_PROMPT } from '../constants.js'
import type { ComputerSettings, TargetOs, Translate } from './types.mjs'

export function getProbeValidationError(
  settings: ComputerSettings,
  translate: Translate
) {
  if (!isValidIpv4Address(settings.ipAddress)) {
    return translate('errors.invalid_ip_address')
  }

  if (!isValidPort(settings.sshPort)) {
    return translate('errors.invalid_ssh_port')
  }

  return null
}

export function assertCanWake(
  settings: ComputerSettings,
  translate: Translate
) {
  if (!isValidMacAddress(settings.macAddress)) {
    throw new Error(translate('errors.invalid_mac_address'))
  }

  if (!isValidIpv4Address(settings.wolBroadcastAddress)) {
    throw new Error(translate('errors.invalid_wol_broadcast_address'))
  }
}

export function assertCanShutdown(
  settings: ComputerSettings,
  translate: Translate
) {
  const probeValidationError = getProbeValidationError(settings, translate)

  if (probeValidationError) {
    throw new Error(probeValidationError)
  }

  if (settings.sshUsername.length === 0) {
    throw new Error(translate('errors.missing_ssh_username'))
  }

  if (settings.sshPassword.length === 0) {
    throw new Error(translate('errors.missing_ssh_password'))
  }
}

export function getShutdownCommand(targetOs: TargetOs) {
  switch (targetOs) {
    case 'windows':
      return 'shutdown /s /t 0'
    case 'macos':
    case 'linux':
    default:
      return `sudo -S -p "${SUDO_PROMPT}" shutdown -h now`
  }
}

export function parseMacAddress(macAddress: string, translate: Translate) {
  const normalizedMacAddress = macAddress.replace(/[^a-fA-F0-9]/g, '')

  if (normalizedMacAddress.length !== 12) {
    throw new Error(translate('errors.invalid_mac_address'))
  }

  return Buffer.from(normalizedMacAddress, 'hex')
}

function isValidIpv4Address(value: string) {
  return net.isIP(value) === 4
}

function isValidPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65535
}

function isValidMacAddress(value: string) {
  return value.replace(/[^a-fA-F0-9]/g, '').length === 12
}

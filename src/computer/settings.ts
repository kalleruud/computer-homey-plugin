import net from 'node:net'

import {
  DEFAULTS,
  MAX_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
} from '../constants.js'
import { ComputerDriverSettings, TargetOs } from '../types.js'

type RawComputerSettings = {
  ipAddress?: unknown
  macAddress?: unknown
  pollIntervalSeconds?: unknown
  targetOs?: unknown
  sshUsername?: unknown
  sshPassword?: unknown
  sshPort?: unknown
}

const TARGET_OPERATING_SYSTEMS: ReadonlySet<TargetOs> = new Set([
  'windows',
  'linux',
  'macos',
])

const ERROR_KEYS = {
  computerIpRequired: 'errors.computerIpRequired',
  computerIpInvalid: 'errors.computerIpInvalid',
  computerMacRequired: 'errors.computerMacRequired',
  computerMacInvalid: 'errors.computerMacInvalid',
  sshPortInvalid: 'errors.sshPortInvalid',
  sshUsernameRequired: 'errors.sshUsernameRequired',
  sshPasswordRequired: 'errors.sshPasswordRequired',
} as const

type ErrorKey = (typeof ERROR_KEYS)[keyof typeof ERROR_KEYS]

export function getComputerSettings(
  settings: RawComputerSettings
): ComputerDriverSettings {
  return {
    ipAddresses: parseCommaSeparatedSegments(settings.ipAddress),
    macAddresses: parseCommaSeparatedSegments(settings.macAddress),
    pollIntervalSeconds: clampPollInterval(settings.pollIntervalSeconds),
    targetOs: getTargetOs(settings.targetOs),
    sshUsername: getTrimmedString(settings.sshUsername),
    sshPassword: getTrimmedString(settings.sshPassword),
    sshPort: getPort(settings.sshPort),
  }
}

export function inferWolBroadcastAddress(ipAddress: string): string {
  if (net.isIP(ipAddress) !== 4) {
    return DEFAULTS.WOL_BROADCAST_ADDRESS
  }

  const octets = ipAddress.split('.')
  octets[3] = '255'
  return octets.join('.')
}

export function getPollIntervalMs(settings: ComputerDriverSettings): number {
  return settings.pollIntervalSeconds * 1000
}

export function getProbeValidationError(
  settings: ComputerDriverSettings
): ErrorKey | null {
  const ipValidationError = getIpAddressesValidationError(settings.ipAddresses)
  if (ipValidationError) {
    return ipValidationError
  }

  if (!isValidPort(settings.sshPort)) {
    return ERROR_KEYS.sshPortInvalid
  }

  return null
}

export function assertCanWake(settings: ComputerDriverSettings) {
  const ipValidationError = getIpAddressesValidationError(settings.ipAddresses)
  if (ipValidationError) {
    throw new Error(ipValidationError)
  }

  if (settings.macAddresses.length === 0) {
    throw new Error(ERROR_KEYS.computerMacRequired)
  }

  for (const macAddress of settings.macAddresses) {
    if (!isValidMacAddress(macAddress)) {
      throw new Error(ERROR_KEYS.computerMacInvalid)
    }
  }
}

export function assertCanShutdown(settings: ComputerDriverSettings) {
  const validationError = getProbeValidationError(settings)
  if (validationError) {
    throw new Error(validationError)
  }

  if (settings.sshUsername.length === 0) {
    throw new Error(ERROR_KEYS.sshUsernameRequired)
  }

  if (settings.sshPassword.length === 0) {
    throw new Error(ERROR_KEYS.sshPasswordRequired)
  }
}

export function parseMacAddress(macAddress: string): Buffer {
  const normalizedMacAddress = macAddress.replaceAll(/[^a-fA-F0-9]/g, '')

  if (normalizedMacAddress.length !== 12) {
    throw new Error(ERROR_KEYS.computerMacInvalid)
  }

  return Buffer.from(normalizedMacAddress, 'hex')
}

function clampPollInterval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULTS.POLL_INTERVAL_SECONDS
  }

  return Math.max(
    MIN_POLL_INTERVAL_SECONDS,
    Math.min(MAX_POLL_INTERVAL_SECONDS, Math.trunc(value))
  )
}

function getPort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULTS.SSH_PORT
  }

  return Math.trunc(value)
}

function getTargetOs(value: unknown): TargetOs {
  if (
    typeof value === 'string' &&
    TARGET_OPERATING_SYSTEMS.has(value as TargetOs)
  ) {
    return value as TargetOs
  }

  return 'linux'
}

function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseCommaSeparatedSegments(value: unknown): string[] {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

function isValidMacAddress(value: string): boolean {
  return value.replaceAll(/[^a-fA-F0-9]/g, '').length === 12
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535
}

function getIpAddressesValidationError(ipAddresses: string[]): ErrorKey | null {
  if (ipAddresses.length === 0) {
    return ERROR_KEYS.computerIpRequired
  }

  for (const ipAddress of ipAddresses) {
    if (net.isIP(ipAddress) !== 4) {
      return ERROR_KEYS.computerIpInvalid
    }
  }

  return null
}

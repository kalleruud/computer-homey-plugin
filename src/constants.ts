export const DEFAULTS = {
  POLL_INTERVAL_SECONDS: 60,
  SSH_PORT: 22,
  WOL_BROADCAST_ADDRESS: '255.255.255.255',
  WOL_PORT: 9, // Usually 9 or 7
} as const

export const MIN_POLL_INTERVAL_SECONDS = 10
export const MAX_POLL_INTERVAL_SECONDS = 3600
export const POLL_TIMEOUT_MS = 3000
export const SSH_READY_TIMEOUT_MS = 10_000
export const STARTUP_REFRESH_DELAY_MS = 10_000
export const SUDO_PROMPT = '[sudo] password:'
export const SSH_UNAVAILABLE_WARNING =
  'Computer is reachable, but SSH is unavailable.'

export const SHUTDOWN_COMMANDS = {
  windows: 'shutdown /s /t 0',
  linux: `sudo -S -p "${SUDO_PROMPT}" shutdown -h now`,
  macos: `sudo -S -p "${SUDO_PROMPT}" shutdown -h now`,
} as const

export const IS_DEBUG = process.env.DEBUG === '1'

export const REQUIRED_CAPABILITIES = [
  'connected',
  'poweron',
  'poweroff',
  'uptime',
] as const

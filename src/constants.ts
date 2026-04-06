export const DEFAULTS = {
  POLL_INTERVAL_SECONDS: 60,
  SHUTDOWN_TIMEOUT_SECONDS: 60,
  SSH_PORT: 22,
  WOL_BROADCAST_ADDRESS: '255.255.255.255',
  WOL_PORT: 9, // Usually 9 or 7
} as const

export const MIN_POLL_INTERVAL_SECONDS = 10
export const MIN_SHUTDOWN_TIMEOUT_SECONDS = 1
export const SHUTDOWN_CONFIRM_POLL_INTERVAL_MS = 2_000
export const POLL_TIMEOUT_MS = 3000
export const SHUTDOWN_REFRESH_DELAY_MS = 5_000
export const SSH_READY_TIMEOUT_MS = 10_000
export const STARTUP_REFRESH_DELAY_MS = 10_000

export const SHUTDOWN_COMMANDS = {
  windows: 'shutdown /s /t 0',
  linux: 'sudo shutdown -h now',
  macos: 'sudo shutdown -h now',
} as const

export const DEFAULTS = {
  POLL_INTERVAL_SECONDS: 60,
  SSH_PORT: 22,
  WOL_BROADCAST_ADDRESS: '255.255.255.255',
  WOL_PORT: 9, // Usually 9 or 7
} as const

export const SHUTDOWN_COMMANDS = {
  windows: 'shutdown /s /t 0',
  linux: 'sudo shutdown -h now',
  macos: 'sudo shutdown -h now',
} as const

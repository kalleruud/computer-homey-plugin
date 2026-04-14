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
export const SUDO_PROMPT = '[sudo] password:'
export const SSH_UNAVAILABLE_WARNING_KEY = 'warnings.sshUnavailable'

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

export const FLOW_CARD_IDS = {
  triggers: {
    turnedOn: 'computer_turned_on',
    turnedOff: 'computer_turned_off',
    uptimeChanged: 'computer_uptime_changed',
    anyTurnedOn: 'any_computer_turned_on',
    anyTurnedOff: 'any_computer_turned_off',
  },
  conditions: {
    isOn: 'computer_is_on',
    anyIsOn: 'any_computer_is_on',
    allAreOn: 'all_computers_are_on',
  },
  actions: {
    turnOn: 'computer_turn_on',
    turnOff: 'computer_turn_off',
    turnAllOn: 'turn_all_computers_on',
    turnAllOff: 'turn_all_computers_off',
  },
} as const

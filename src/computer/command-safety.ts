/**
 * Blocklist guardrail for user-defined SSH commands. Match whole words only
 * (case-insensitive) so short tokens do not match inside unrelated words.
 */
const FORBIDDEN_CUSTOM_COMMAND_TERMS = [
  'chmod',
  'chown',
  'curl',
  'dd',
  'fdisk',
  'format',
  'iptables',
  'mkfs',
  'nc',
  'netcat',
  'parted',
  'rm',
  'shred',
  'wget',
] as const

const CUSTOM_COMMAND_NOT_ALLOWED = 'errors.customCommandNotAllowed' as const

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

export function assertCustomSshCommandAllowed(command: string): void {
  const haystack = command.toLowerCase()

  for (const term of FORBIDDEN_CUSTOM_COMMAND_TERMS) {
    const pattern = new RegExp(String.raw`\b${escapeRegExp(term)}\b`)
    if (pattern.test(haystack)) {
      throw new Error(CUSTOM_COMMAND_NOT_ALLOWED)
    }
  }
}

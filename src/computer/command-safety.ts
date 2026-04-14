/**
 * Blocklist guardrail for user-defined SSH commands. Match whole words only
 * (case-insensitive) so short tokens do not match inside unrelated words.
 */
const FORBIDDEN_CUSTOM_COMMAND_TERMS = [
  'apt',
  'apt-get',
  'aptitude',
  'aria2c',
  'bash',
  'base64',
  'blkdiscard',
  'btrfs',
  'chmod',
  'chown',
  'crontab',
  'cryptsetup',
  'curl',
  'dd',
  'dnf',
  'dpkg',
  'eval',
  'exec',
  'fdisk',
  'format',
  'ftp',
  'gem',
  'hdparm',
  'iptables',
  'kill',
  'killall',
  'kpartx',
  'losetup',
  'lvremove',
  'mkfs',
  'mkswap',
  'mount',
  'nc',
  'netcat',
  'node',
  'npm',
  'parted',
  'perl',
  'pip',
  'pkill',
  'pvcreate',
  'python',
  'python3',
  'rcp',
  'rm',
  'rpm',
  'rsync',
  'ruby',
  'rsh',
  'scp',
  'sftp',
  'sh',
  'shred',
  'snap',
  'swapon',
  'swapoff',
  'tee',
  'telnet',
  'umount',
  'useradd',
  'userdel',
  'vgremove',
  'vi',
  'vim',
  'wget',
  'xargs',
  'yum',
  'zfs',
  'zpool',
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

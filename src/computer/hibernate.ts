import { HIBERNATE_COMMANDS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommand } from './ssh-exec.js'

export async function hibernateComputerOverSsh(
  settings: ComputerDriverSettings
) {
  const command = HIBERNATE_COMMANDS[settings.targetOs]
  if (command === null) {
    throw new Error('errors.hibernateUnsupported')
  }
  await runSshCommand(settings, command, {
    requireExitCode: true,
    timeoutMs: 30_000,
  })
}

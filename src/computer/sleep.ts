import { SLEEP_COMMANDS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommand } from './ssh-exec.js'

export async function sleepComputerOverSsh(settings: ComputerDriverSettings) {
  const command = SLEEP_COMMANDS[settings.targetOs]
  if (command === null) {
    throw new Error('errors.sleepUnsupported')
  }
  await runSshCommand(settings, command, {
    requireExitCode: true,
    timeoutMs: 30_000,
  })
}

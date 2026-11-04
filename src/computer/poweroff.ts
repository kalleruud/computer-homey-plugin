import { SHUTDOWN_COMMANDS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommand } from './ssh-exec.js'

export async function shutdownComputerOverSsh(
  settings: ComputerDriverSettings
) {
  const command =
    settings.customShutdownCommand.length > 0
      ? settings.customShutdownCommand
      : SHUTDOWN_COMMANDS[settings.targetOs]
  await runSshCommand(settings, command)
}

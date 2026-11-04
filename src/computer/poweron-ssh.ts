import { DEFAULT_POWER_ON_SSH_COMMAND } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommand } from './ssh-exec.js'

export async function powerOnOverSsh(settings: ComputerDriverSettings) {
  const command =
    settings.customPowerOnCommand.length > 0
      ? settings.customPowerOnCommand
      : DEFAULT_POWER_ON_SSH_COMMAND
  await runSshCommand(settings, command, { usePty: false })
}

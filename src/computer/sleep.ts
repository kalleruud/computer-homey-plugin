import { SLEEP_COMMANDS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommand } from './ssh-exec.js'

export async function sleepComputerOverSsh(settings: ComputerDriverSettings) {
  await runSshCommand(settings, SLEEP_COMMANDS[settings.targetOs])
}

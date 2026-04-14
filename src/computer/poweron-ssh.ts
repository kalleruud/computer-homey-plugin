import { DEFAULT_POWER_ON_SSH_COMMAND } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommandOnHost } from './ssh-exec.js'

export async function powerOnOverSsh(settings: ComputerDriverSettings) {
  const command =
    settings.customPowerOnCommand.length > 0
      ? settings.customPowerOnCommand
      : DEFAULT_POWER_ON_SSH_COMMAND

  try {
    await Promise.any(
      settings.ipAddresses.map(host =>
        runSshCommandOnHost(settings, host, command, false)
      )
    )
  } catch (error) {
    if (error instanceof AggregateError) {
      const [firstError] = error.errors
      if (firstError instanceof Error) {
        throw firstError
      }
    }

    throw error
  }
}

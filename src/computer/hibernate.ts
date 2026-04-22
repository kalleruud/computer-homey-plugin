import { HIBERNATE_COMMANDS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { runSshCommandOnHost } from './ssh-exec.js'

export async function hibernateComputerOverSsh(
  settings: ComputerDriverSettings
) {
  try {
    await Promise.any(
      settings.ipAddresses.map(host =>
        hibernateComputerOverSshOnHost(settings, host)
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

async function hibernateComputerOverSshOnHost(
  settings: ComputerDriverSettings,
  host: string
) {
  const command = HIBERNATE_COMMANDS[settings.targetOs]
  const usePty = settings.targetOs !== 'windows'
  await runSshCommandOnHost(settings, host, command, usePty)
}

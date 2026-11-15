import { SHUTDOWN_COMMANDS } from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import { getSshAuthentication, runSshCommandOnHost } from './ssh-exec.js'

export async function shutdownComputerOverSsh(
  settings: ComputerDriverSettings
) {
  const authentication = getSshAuthentication(settings)
  const usePty = settings.targetOs !== 'windows'
  const command =
    settings.customShutdownCommand ||
    (settings.sshPrivateKey && usePty
      ? 'sudo -n shutdown -h now'
      : SHUTDOWN_COMMANDS[settings.targetOs])

  try {
    await Promise.any(
      settings.ipAddresses.map(host =>
        runSshCommandOnHost(settings, host, command, { usePty }, authentication)
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

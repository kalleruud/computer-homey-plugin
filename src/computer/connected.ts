import { debugLog, getDeviceState } from '@src/device.js'
import type { Device } from 'homey'
import { execFile } from 'node:child_process'
import net from 'node:net'
import {
  POLL_TIMEOUT_MS,
  STARTUP_REFRESH_DELAY_MS as REFRESH_DELAY_MS,
  SSH_UNAVAILABLE_WARNING,
} from '../constants.js'
import { ComputerDriverSettings } from '../types.js'
import {
  getComputerSettings,
  getPollIntervalMs,
  getProbeValidationError,
} from './settings.js'
import { getUptimeSeconds } from './uptime.js'

type ComputerConnectionState = {
  isOnline: boolean
  warning?: string
}

export function stopPolling(device: Device) {
  const state = getDeviceState(device)

  if (state.pollIntervalTimer) {
    device.homey.clearInterval(state.pollIntervalTimer)
    state.pollIntervalTimer = undefined
  }

  if (state.refreshTimer) {
    device.homey.clearTimeout(state.refreshTimer)
    state.refreshTimer = undefined
  }
}

export async function startPolling(device: Device) {
  stopPolling(device)

  const state = getDeviceState(device)
  const settings = getComputerSettings(device.getSettings())
  const intervalMs = getPollIntervalMs(settings)

  debugLog(device, `Starting computer status polling every ${intervalMs} ms`)

  state.pollIntervalTimer = device.homey.setInterval(() => {
    debugLog(device, 'Polling timer fired')
    void refreshComputerState(device)
  }, intervalMs)

  debugLog(device, 'Running initial poll immediately after startup')
  await refreshComputerState(device)
}

export function scheduleRefresh(device: Device) {
  const state = getDeviceState(device)

  if (state.refreshTimer) {
    device.homey.clearTimeout(state.refreshTimer)
  }

  debugLog(device, `Scheduling follow-up poll in ${REFRESH_DELAY_MS} ms`)

  state.refreshTimer = device.homey.setTimeout(() => {
    getDeviceState(device).refreshTimer = undefined
    debugLog(device, 'Scheduled follow-up poll fired')
    void refreshComputerState(device)
  }, REFRESH_DELAY_MS)
}

async function pollComputerConnectionState(
  settings: ComputerDriverSettings,
  onMissingPingCommand: () => void
): Promise<ComputerConnectionState> {
  const validationError = getProbeValidationError(settings)
  if (validationError) {
    return {
      isOnline: false,
      warning: validationError,
    }
  }

  const isSshReachable = await probeTcpPort(
    settings.ipAddress,
    settings.sshPort
  )
  if (isSshReachable) {
    return {
      isOnline: true,
    }
  }

  const isPingReachable = await probePing(
    settings.ipAddress,
    onMissingPingCommand
  )
  if (isPingReachable) {
    return {
      isOnline: true,
      warning: SSH_UNAVAILABLE_WARNING,
    }
  }

  return {
    isOnline: false,
  }
}

async function refreshComputerState(device: Device): Promise<boolean> {
  const state = getDeviceState(device)
  if (state.pollInFlight) {
    debugLog(device, 'Skipping poll because another poll is already running')
    return device.getCapabilityValue('connected') === true
  }

  state.pollInFlight = true

  try {
    const settings = getComputerSettings(device.getSettings())

    debugLog(
      device,
      `Polling computer status for ${settings.ipAddress || '<missing ip>'} on SSH port ${settings.sshPort.toString()}`
    )

    const connectionState = await pollComputerConnectionState(settings, () => {
      if (state.pingCommandMissingLogged) {
        return
      }

      state.pingCommandMissingLogged = true
      device.error('Ping command is not available for fallback status checks')
    })

    return await applyConnectionState(device, connectionState)
  } catch (error) {
    device.error('Failed to poll the computer status', error)
    return device.getCapabilityValue('connected') === true
  } finally {
    state.pollInFlight = false
  }
}

async function applyConnectionState(
  device: Device,
  connectionState: Awaited<ReturnType<typeof pollComputerConnectionState>>
): Promise<boolean> {
  const { isOnline, warning } = connectionState

  debugLog(
    device,
    `Poll result: online=${isOnline.toString()} warning=${warning ?? 'none'}`
  )

  if (warning) {
    await device.setWarning(warning)
  } else {
    await device.unsetWarning()
  }

  const uptimeSeconds = getUptimeSeconds(device, isOnline)

  if (device.getCapabilityValue('connected') !== isOnline) {
    await device.setCapabilityValue('connected', isOnline)
  }

  if (device.getCapabilityValue('uptime') !== uptimeSeconds) {
    await device.setCapabilityValue('uptime', uptimeSeconds)
  }

  debugLog(
    device,
    `Applied capability state: connected=${isOnline.toString()} uptime=${uptimeSeconds.toString()}`
  )

  return isOnline
}

async function probeTcpPort(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let settled = false

    const finish = (isOnline: boolean) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(isOnline)
    }

    socket.setTimeout(POLL_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function probePing(
  host: string,
  onMissingPingCommand: () => void
): Promise<boolean> {
  return new Promise(resolve => {
    execFile('ping', ['-c', '1', '-W', '1', host], error => {
      if (!error) {
        resolve(true)
        return
      }

      if ('code' in error && error.code === 'ENOENT') {
        onMissingPingCommand()
      }

      resolve(false)
    })
  })
}

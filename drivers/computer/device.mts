import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import net from 'node:net';

import Homey from 'homey';
import { Client, type ClientChannel } from 'ssh2';

const DEFAULT_POLL_INTERVAL_SECONDS = 60;
const DEFAULT_SSH_PORT = 22;
const DEFAULT_WOL_BROADCAST_ADDRESS = '255.255.255.255';
const DEFAULT_WOL_PORT = 9;
const MIN_POLL_INTERVAL_SECONDS = 10;
const POLL_TIMEOUT_MS = 3000;
const SHUTDOWN_REFRESH_DELAY_MS = 5000;
const SSH_READY_TIMEOUT_MS = 10000;
const STARTUP_REFRESH_DELAY_MS = 10000;
const SUDO_PROMPT = '[sudo] password:';

type TargetOs = 'windows' | 'linux' | 'macos';
type DeviceSettingsEvent = Parameters<typeof Homey.Device.prototype.onSettings>[0];
type DeviceSettings = DeviceSettingsEvent['newSettings'];
type DeviceSettingValue = DeviceSettings[string];

type ComputerSettings = {
  ipAddress: string;
  macAddress: string;
  pollIntervalSeconds: number;
  targetOs: TargetOs;
  sshUsername: string;
  sshPassword: string;
  sshPort: number;
  wolBroadcastAddress: string;
};

export default class ComputerDevice extends Homey.Device {
  private pollIntervalTimer?: NodeJS.Timeout;

  private refreshTimer?: NodeJS.Timeout;

  private pollInFlight = false;

  override async onInit() {
    this.log('Computer device has been initialized');
    await this.ensureAlarmSshCapability();
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.startPolling();
  }

  override async onAdded() {
    this.log('Computer device has been added');
  }

  override async onSettings({
    changedKeys,
  }: Parameters<typeof Homey.Device.prototype.onSettings>[0]) {
    this.log('Computer settings changed', changedKeys);
    this.startPolling();
    await this.pollOnlineStatus();
    return this.homey.__('messages.settings_updated');
  }

  override async onRenamed(name: string) {
    this.log('Computer device was renamed to', name);
  }

  override async onDeleted() {
    this.stopPolling();
    this.log('Computer device has been deleted');
  }

  override async onUninit() {
    this.stopPolling();
  }

  async startComputer() {
    const settings = this.getTypedSettings();
    this.assertCanWake(settings);
    await this.sendWakeOnLan(settings);
    this.scheduleRefresh(STARTUP_REFRESH_DELAY_MS);
  }

  async shutdownComputer() {
    const settings = this.getTypedSettings();
    this.assertCanShutdown(settings);
    await this.executeShutdown(settings);
    this.scheduleRefresh(SHUTDOWN_REFRESH_DELAY_MS);
  }

  private async onCapabilityOnoff(value: boolean) {
    if (value) {
      await this.startComputer();
      return;
    }

    await this.shutdownComputer();
  }

  private startPolling() {
    this.stopPolling();

    const pollIntervalMs = this.getPollIntervalMs();
    this.pollIntervalTimer = this.homey.setInterval(() => {
      void this.pollOnlineStatus();
    }, pollIntervalMs);

    void this.pollOnlineStatus();
  }

  private stopPolling() {
    if (this.pollIntervalTimer) {
      this.homey.clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = undefined;
    }

    if (this.refreshTimer) {
      this.homey.clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private scheduleRefresh(delayMs: number) {
    if (this.refreshTimer) {
      this.homey.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = this.homey.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.pollOnlineStatus();
    }, delayMs);
  }

  private async pollOnlineStatus() {
    if (this.pollInFlight) {
      return this.getCapabilityValue('onoff') === true;
    }

    this.pollInFlight = true;

    try {
      const settings = this.getTypedSettings();
      const validationError = this.getProbeValidationError(settings);

      if (validationError) {
        await this.setWarning(validationError);
        await this.syncSshAlarmState(true);
        await this.syncOnOffState(false);
        return false;
      }

      const isSshReachable = await this.probeTcpPort(
        settings.ipAddress,
        settings.sshPort
      );

      if (isSshReachable) {
        await this.unsetWarning();
        await this.syncSshAlarmState(false);
        this.log(
          `Poll connection status for ${settings.ipAddress}:${settings.sshPort}: online (ssh reachable)`
        );
        await this.syncOnOffState(true);
        return true;
      }

      const isPingReachable = await this.probePing(settings.ipAddress);

      if (isPingReachable) {
        await this.setWarning(this.homey.__('warnings.ssh_unavailable'));
        await this.syncSshAlarmState(true);
        this.log(
          `Poll connection status for ${settings.ipAddress}:${settings.sshPort}: online (ping reachable, ssh unavailable)`
        );
        await this.syncOnOffState(true);
        return true;
      }

      await this.unsetWarning();
      await this.syncSshAlarmState(true);
      this.log(
        `Poll connection status for ${settings.ipAddress}:${settings.sshPort}: offline`
      );
      await this.syncOnOffState(false);
      return false;
    } catch (error) {
      this.error('Failed to poll the computer status', error);
      return this.getCapabilityValue('onoff') === true;
    } finally {
      this.pollInFlight = false;
    }
  }

  private async syncOnOffState(isOnline: boolean) {
    if (this.getCapabilityValue('onoff') !== isOnline) {
      await this.setCapabilityValue('onoff', isOnline);
    }
  }

  private async syncSshAlarmState(isUnreachable: boolean) {
    if (!this.hasCapability('alarm_ssh')) {
      return;
    }

    if (this.getCapabilityValue('alarm_ssh') !== isUnreachable) {
      await this.setCapabilityValue('alarm_ssh', isUnreachable);
    }
  }

  private async ensureAlarmSshCapability() {
    if (!this.hasCapability('alarm_ssh')) {
      await this.addCapability('alarm_ssh');
    }
  }

  private getTypedSettings(): ComputerSettings {
    const settings = this.getSettings() as DeviceSettings;

    return {
      ipAddress: this.getTrimmedString(settings.ip_address),
      macAddress: this.getTrimmedString(settings.mac_address),
      pollIntervalSeconds: this.getNumber(
        settings.poll_interval,
        DEFAULT_POLL_INTERVAL_SECONDS
      ),
      targetOs: this.getTargetOs(settings.target_os),
      sshUsername: this.getTrimmedString(settings.ssh_username),
      sshPassword: this.getTrimmedString(settings.ssh_password),
      sshPort: this.getNumber(settings.ssh_port, DEFAULT_SSH_PORT),
      wolBroadcastAddress:
        this.getTrimmedString(settings.wol_broadcast_address) ||
        DEFAULT_WOL_BROADCAST_ADDRESS,
    };
  }

  private getTrimmedString(value: DeviceSettingValue) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private getNumber(value: DeviceSettingValue, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : fallback;
  }

  private getTargetOs(value: DeviceSettingValue): TargetOs {
    if (value === 'windows' || value === 'linux' || value === 'macos') {
      return value;
    }

    return 'linux';
  }

  private getPollIntervalMs() {
    const settings = this.getTypedSettings();
    const clampedSeconds = Math.max(
      MIN_POLL_INTERVAL_SECONDS,
      settings.pollIntervalSeconds
    );

    return clampedSeconds * 1000;
  }

  private getProbeValidationError(settings: ComputerSettings) {
    if (!this.isValidIpv4Address(settings.ipAddress)) {
      return this.homey.__('errors.invalid_ip_address');
    }

    if (!this.isValidPort(settings.sshPort)) {
      return this.homey.__('errors.invalid_ssh_port');
    }

    return null;
  }

  private assertCanWake(settings: ComputerSettings) {
    if (!this.isValidMacAddress(settings.macAddress)) {
      throw new Error(this.homey.__('errors.invalid_mac_address'));
    }

    if (!this.isValidIpv4Address(settings.wolBroadcastAddress)) {
      throw new Error(this.homey.__('errors.invalid_wol_broadcast_address'));
    }
  }

  private assertCanShutdown(settings: ComputerSettings) {
    const probeValidationError = this.getProbeValidationError(settings);

    if (probeValidationError) {
      throw new Error(probeValidationError);
    }

    if (settings.sshUsername.length === 0) {
      throw new Error(this.homey.__('errors.missing_ssh_username'));
    }

    if (settings.sshPassword.length === 0) {
      throw new Error(this.homey.__('errors.missing_ssh_password'));
    }
  }

  private isValidIpv4Address(value: string) {
    return net.isIP(value) === 4;
  }

  private isValidPort(value: number) {
    return Number.isInteger(value) && value >= 1 && value <= 65535;
  }

  private isValidMacAddress(value: string) {
    return value.replace(/[^a-fA-F0-9]/g, '').length === 12;
  }

  private parseMacAddress(macAddress: string) {
    const normalizedMacAddress = macAddress.replace(/[^a-fA-F0-9]/g, '');

    if (normalizedMacAddress.length !== 12) {
      throw new Error(this.homey.__('errors.invalid_mac_address'));
    }

    return Buffer.from(normalizedMacAddress, 'hex');
  }

  private async sendWakeOnLan(settings: ComputerSettings) {
    const macAddress = this.parseMacAddress(settings.macAddress);
    const magicPacket = Buffer.alloc(6 + 16 * macAddress.length, 0xff);

    for (let index = 0; index < 16; index += 1) {
      macAddress.copy(magicPacket, 6 + index * macAddress.length);
    }

    await new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket('udp4');

      socket.once('error', error => {
        socket.close();
        reject(error);
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(
          magicPacket,
          DEFAULT_WOL_PORT,
          settings.wolBroadcastAddress,
          error => {
            socket.close();

            if (error) {
              reject(error);
              return;
            }

            resolve();
          }
        );
      });
    }).catch(error => {
      this.error('Failed to send the Wake-on-LAN packet', error);
      throw new Error(this.homey.__('errors.startup_failed'));
    });
  }

  private async executeShutdown(settings: ComputerSettings) {
    const command = this.getShutdownCommand(settings.targetOs);
    const needsSudo = settings.targetOs !== 'windows';

    try {
      await this.executeSshCommand(settings, command, needsSudo);
    } catch (error) {
      this.error('Failed to shut down the computer over SSH', error);
      throw new Error(this.homey.__('errors.ssh_shutdown_failed'));
    }
  }

  private getShutdownCommand(targetOs: TargetOs) {
    switch (targetOs) {
      case 'windows':
        return 'shutdown /s /t 0';
      case 'macos':
      case 'linux':
      default:
        return `sudo -S -p "${SUDO_PROMPT}" shutdown -h now`;
    }
  }

  private async executeSshCommand(
    settings: ComputerSettings,
    command: string,
    needsSudo: boolean
  ) {
    await new Promise<void>((resolve, reject) => {
      const client = new Client();
      let settled = false;
      let passwordSent = false;
      let stdout = '';
      let stderr = '';

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        client.end();

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      const maybeSendPassword = (chunk: string, stream: ClientChannel) => {
        if (!needsSudo || passwordSent || !chunk.includes(SUDO_PROMPT)) {
          return;
        }

        passwordSent = true;
        stream.write(`${settings.sshPassword}\n`);
      };

      client.once('error', finish);

      client.once('ready', () => {
        client.exec(command, { pty: needsSudo }, (error, stream) => {
          if (error) {
            finish(error);
            return;
          }

          stream.once('error', finish);

          stream.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            maybeSendPassword(chunk, stream);
          });

          stream.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            maybeSendPassword(chunk, stream);
          });

          stream.once('close', (code: number | null) => {
            if (code === 0 || code === null) {
              finish();
              return;
            }

            const errorMessage =
              stderr.trim() ||
              stdout.trim() ||
              `SSH command exited with code ${code.toString()}`;

            finish(new Error(errorMessage));
          });
        });
      });

      client.connect({
        host: settings.ipAddress,
        port: settings.sshPort,
        username: settings.sshUsername,
        password: settings.sshPassword,
        readyTimeout: SSH_READY_TIMEOUT_MS,
        keepaliveInterval: 2000,
        keepaliveCountMax: 2,
      });
    });
  }

  private async probeTcpPort(host: string, port: number) {
    return new Promise<boolean>(resolve => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (isOnline: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();
        resolve(isOnline);
      };

      socket.setTimeout(POLL_TIMEOUT_MS);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  private async probePing(host: string) {
    return new Promise<boolean>(resolve => {
      execFile('ping', ['-c', '1', '-W', '1', host], error => {
        if (!error) {
          resolve(true);
          return;
        }

        if ('code' in error && error.code === 'ENOENT') {
          this.error(
            'Ping command is not available for fallback status checks'
          );
        }

        resolve(false);
      });
    });
  }
}

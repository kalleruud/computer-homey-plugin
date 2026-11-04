# Computer

Wake, monitor, and power down your computer from Homey.

## Features

- Start a computer with Wake-on-LAN.
- Monitor whether the computer is reachable from Homey.
- Shut down the computer over SSH.
- Create Flows that start or shut down selected computers.
- Add multiple computers, each with their own network and SSH settings.

# Setup

1. Log in
   ```bash
   bunx homey login
   ```
1. Select the Homey used for development
   ```bash
   bunx homey select
   ```
1. Install and run Docker Desktop
   ```bash
   brew install docker
   ```
1. Install dependencies
   ```bash
   bun install
   ```
1. Generate the app manifest
   ```bash
   bun run app:build
   ```
1. Run the app
   ```bash
   bun run dev
   ```

## Device setup

1. Add a `Computer` device in Homey.
1. Open the device settings and enter the computer IP address and MAC address.
1. Select the target operating system.
1. If you want remote shutdown, enter the SSH username, password, and port.
1. Test the on/off control from Homey.

## Notes

- Wake-on-LAN must be enabled in the computer BIOS or UEFI and operating system.
- Windows: OpenSSH server must be installed and running.
- The app marks the computer as online when SSH responds. If ping works but SSH does not, Homey shows the computer as on with a connectivity warning.
- Linux and macOS shutdown uses `sudo shutdown -h now`, so the configured SSH account must be allowed to run that command.

# Credits

- [App icon](https://unsplash.com/illustrations/a-simple-black-and-white-computer-icon-uKxKGmoiW9g) by [Boxicons](https://unsplash.com/@boxicons/illustrations)
- [Store photo](https://unsplash.com/photos/white-and-black-hp-laptop-hRI8f-2WyDw) by [John M. Smith](https://unsplash.com/@john_smith)
- [Driver photo](https://unsplash.com/photos/a-computer-monitor-sitting-on-top-of-a-desk-3ttxeT6-Flo) by [ichwar -](https://unsplash.com/@ilmuktigraphic)

## SSH private keys

For shutdown or SSH power-on, set the SSH username and paste the complete private
key into **SSH private key** in the device settings. Supported formats are OpenSSH
Ed25519/RSA and PEM RSA (including encrypted keys). Install the matching public key
in the server account's `~/.ssh/authorized_keys`. For encrypted keys, save the exact
passphrase in **Private key passphrase**, including any spaces. Replace the text
to rotate a key; clear it to return to password authentication. With a key set,
the SSH password is unused and authentication never falls back to passwords.

The key is visible in the multiline field. The passphrase is visually masked;
both are persisted per device on Homey for unattended use. The app adds no
encryption at rest: Homey's [settings documentation](https://apps.developer.homey.app/the-basics/devices/settings)
promises visual masking, not encryption. Treat device settings and Homey backups
as credentials; use a dedicated account/key with limited permissions.

In key mode, commands run without a terminal or interactive input, with a
30-second timeout. Commands using sudo require command-specific `NOPASSWD`
authorization. For example, use `visudo` to allow
`homey ALL=(root) NOPASSWD: /usr/sbin/shutdown -h now` (verify the executable path
on your server). Sudo is made non-interactive; missing authorization fails without
sending a password or passphrase. Commands already authorized without sudo need
no sudo rule. Existing password-mode sudo behavior is preserved.

SSH power-on needs a reachable SSH endpoint, such as a BMC. An already powered-off
host still needs Wake-on-LAN or another available controller. CA-signed user
certificates, PuTTY PPK, agents and hardware-backed keys are not supported.

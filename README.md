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
   bun run prepare
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
- The app marks the computer as online when SSH responds. If ping works but SSH does not, Homey shows the computer as on with a connectivity warning.
- Linux and macOS shutdown uses `sudo shutdown -h now`, so the configured SSH account must be allowed to run that command.

Computer

Wake, monitor, and power down your computer from Homey.

What this app does

- Starts computers with Wake-on-LAN.
- Monitors whether each computer is reachable from Homey.
- Shuts down computers over SSH.
- Adds Flow action cards to start or shut down a selected computer.
- Supports adding multiple computers, each with their own settings.

Before you add a device

- Enable Wake-on-LAN in the computer BIOS or UEFI and operating system.
- Give the computer a stable local IP address or DHCP reservation.
- Enable SSH on the computer.
- Note the computer IP address, MAC address, SSH port, username, and password.
- For Linux and macOS, make sure the SSH user is allowed to run `sudo shutdown -h now`.

Setup

1. Add a `Computer` device in Homey.
2. Open the device settings.
3. Enter the IP address and MAC address.
4. Select the correct operating system.
5. If you want remote shutdown, enter the SSH username, password, and port.
6. Test the on/off control in Homey.

How it works

- Turning the device on sends a Wake-on-LAN packet.
- Turning the device off connects over SSH and runs the configured shutdown command.
- The online state is checked with SSH first. If SSH is unavailable but ping still responds, Homey shows a connectivity warning.

Troubleshooting

- If the computer does not start, verify Wake-on-LAN support, MAC address, broadcast address, and network configuration.
- If the device stays unavailable, verify the IP address, SSH port, firewall rules, and that the SSH service is running.
- If shutdown fails, verify the SSH credentials and confirm the account can run the shutdown command.
- On Windows, make sure OpenSSH Server is enabled and the user can run `shutdown /s /t 0`.
Lets you monitor and turn on/off your computer.

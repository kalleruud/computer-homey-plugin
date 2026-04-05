Control your computer from Homey with a simple device tile and Flow actions. Turn it on with Wake-on-LAN, see whether it is reachable on your network, and shut it down remotely over SSH when you are done.

Computer is useful for everyday routines like starting a media PC before movie night, powering up a workstation when you arrive home, or shutting down a machine automatically at bedtime. Add one or more computers in Homey, configure their network and SSH settings, and manage them alongside the rest of your home.

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

How it works
- Turning the device on sends a Wake-on-LAN packet.
- Turning the device off connects over SSH and runs the configured shutdown command.
- The online state is checked with SSH first. If SSH is unavailable but ping still responds, Homey shows a connectivity warning.

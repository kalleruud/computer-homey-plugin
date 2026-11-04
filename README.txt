Control your computer from Homey with a simple device tile and Flow actions. Turn it on with Wake-on-LAN, see whether it is reachable on your network, and shut it down remotely over SSH when you are done.

Computer is useful for everyday routines like starting a media PC before movie night, powering up a workstation when you arrive home, or shutting down a machine automatically at bedtime. Add one or more computers in Homey, configure their network and SSH settings, and manage them alongside the rest of your home.

What this app does
- Starts computers with Wake-on-LAN.
- Monitors whether each computer is reachable from Homey.
- Shuts down computers over SSH.
- Puts computers to sleep or hibernate over SSH.
- Adds Flow action cards to start, shut down, sleep, or hibernate a selected computer, plus actions for all computers.
- Supports adding multiple computers, each with their own settings.
- Lets you enter several IP addresses and MAC addresses as comma-separated lists for one computer, so you can cover both Wi-Fi and Ethernet on the same machine (wake every WoL target, try SSH shutdown on every IP, and treat the computer as online if any address responds).

Before you add a device
- Enable Wake-on-LAN in the computer BIOS or UEFI and operating system.
- Give the computer a stable local IP address or DHCP reservation (one per interface you use; you can list them all, separated by commas).
- Enable SSH on the computer.
- Note each IP address and MAC address you need (comma-separated if the PC has more than one active interface, e.g. Wi-Fi and LAN), plus SSH port, username, and password.
- For Linux and macOS, make sure the SSH user is allowed to run `sudo shutdown -h now`, `sudo systemctl suspend`, and `sudo systemctl hibernate` (Linux), plus `sudo pmset sleepnow` (macOS).

How it works
- Turning the device on sends a Wake-on-LAN magic packet for each configured MAC (broadcast is still inferred from the paired IP in the list).
- Turning the device off, sleeping it, or hibernating it connects over SSH on each configured IP until one succeeds and runs the configured shutdown command or the supported sleep/hibernate command for the selected OS.
- The online state is checked across all IPs: SSH is tried on every address in parallel with ping fallback; if any address answers, the computer counts as online. If SSH is unavailable everywhere but ping still responds on at least one, Homey shows a connectivity warning.

OS command notes
- Windows supports shutdown and hibernation; sleep is deferred because SetSuspendState is not a compatible rundll32 entry point.
- Linux uses `systemctl suspend` and `systemctl hibernate` with sudo.
- macOS sleep uses `pmset sleepnow`; hibernation is unsupported to avoid changing persistent power settings.

Sleep and hibernate actions require an explicit successful SSH exit status within 30 seconds. A disconnect or timeout reports an unconfirmed action, even if the computer did enter sleep; check reachability before retrying. Success confirms command acceptance, not hardware sleep or wake support. Wake-on-LAN after sleep or hibernation depends on firmware, network adapter and OS settings; SSH startup requires a separate reachable controller.

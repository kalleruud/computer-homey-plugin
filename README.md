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

### Laptop battery monitoring

Enable **Monitor laptop battery** in device settings and select the laptop's OS.
Monitoring requires a running SSH server with password authentication and the existing
host(s), port, username and password. No additional agent is needed. Linux requires
readable `/sys/class/power_supply` system batteries (device-scoped peripherals are
excluded); macOS requires `ioreg` and AppleSmartBattery; Windows requires OpenSSH,
Windows PowerShell and the active system battery classes in `root/wmi` (not UPS or
peripheral APIs). Unsupported firmware/providers or unavailable commands report unknown.
Comparable full-charge and remaining capacities are summed for a weighted percentage;
otherwise the lowest valid battery percentage is used, never an unweighted average.
Charge-only capacities (including macOS raw charge) use this fallback because battery
voltages may differ; only comparable energy capacities are summed.

Polling uses the existing interval (60 seconds by default, 10–3,600 seconds).
Offline computers, missing batteries and failed/invalid SSH queries report unknown,
clearing the displayed percentage. Queries time out after 10 seconds per host.
Battery failures do not determine computer reachability or affect power controls.
Disabling monitoring removes the battery capability and its dependent Flow cards.

Create your own Flows with the battery entry triggers:

1. Battery enters **below 30%** → turn the charging smart plug **on**.
2. Battery enters **above 80%** → turn the charging smart plug **off**.

Comparisons are strict: equality does not match. Between thresholds these Flows leave
the plug unchanged. Each configured threshold fires once per entry, including the
first qualifying fresh reading after enablement, restart or recovery. Conditions use
fresh readings and stop with an error when unknown, including inverted conditions.
Automation depends on fresh SSH telemetry and resumes on the first valid reading.

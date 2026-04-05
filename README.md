# Computer

Lets you monitor and turn on/off your computer.

# Setup

Preferred: open the repository in the Dev Container. It installs Bun, the Homey CLI, project dependencies, and generates `app.json` automatically.

1. Login
   ```bash
   bunx homey login
   ```
1. Select homey for development
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
1. Build the app
   ```bash
   bun run prepare
   ```
1. Run the app
   ```bash
   bun run dev
   ```

# Tools: Hermes Sentinel (hermes-sentinel)

The Hermes Sentinel utilizes local CLI and system utilities on the host machine:

## 1. Local Shell Commands
* `uname -a` (Linux/macOS) / `systeminfo` (Windows): Fingerprints the operating system.
* `hostname`: Determines the active device network identity.
* `w` / `whoami`: Audits active shell sessions and user contexts.

## 2. Docker CLI
* `docker ps`: Lists running containers and their image tags.
* `docker inspect <container>`: Inspects container configurations, environment variables, and network bindings.
* `docker logs --tail <N> <container>`: Views real-time logs of local application containers.

## 3. Network Diagnostics
* `netstat -tulpn` / `Get-NetTCPConnection` (Windows): Identifies open ports, active sockets, and potential port collisions.
* `ping` / `curl`: Verifies local network loops and local API health endpoints (`http://localhost:3100/api/health`).

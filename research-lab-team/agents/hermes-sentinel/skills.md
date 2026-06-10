# Skills: Hermes Sentinel (hermes-sentinel)

## 1. System Telemetry & Profiling
* **OS & Platform Detection**: Identifies system configurations using env variables (`PAPERCLIP_DEVICE_PLATFORM`) or system commands (`uname -a`, `cmd /c ver`).
* **Network Hostname Resolution**: Fetches active network identifiers (`PAPERCLIP_DEVICE_HOSTNAME`, `hostname`).

## 2. Docker & Daemon Management
* **Container Auditing**: Queries docker socket daemon and processes (`docker ps`, `docker compose ps`).
* **Thread Triage**: Identifies zombie processes, orphaned background tasks, and stale socket states.

## 3. Local Shell Triage
* **Command Execution**: Proposes and executes non-destructive terminal shell commands (Bash, PowerShell) on the local host.
* **File Operations**: Audits local files, handles system logs, and verifies local package dependencies.

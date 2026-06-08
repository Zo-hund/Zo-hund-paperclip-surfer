---
name: system-health-monitor
description: >-
  Monitors the health of the local developer environment (storage, WSL, Docker, Kubernetes, packages) and runs automated repairs for low disk space, stopped Docker daemons, or missing WSL packages.
---

# System Health Monitor

## Overview
This skill automates the system health checks and repair workflows for the Paperclip dev stack. It validates storage constraints, WSL boot capability, filesystem integrity, Docker, Kubernetes, and Linux environment dependencies, applying automated repairs where possible.

## Dependencies
This is a core system utility and has no other external skill dependencies.

## Quick Start
To manually run the full environment health diagnostic and repair routine, run the PowerShell script on the Windows host:

```powershell
powershell -File "D:\AMX-AIR-HUBS-LOCAL\instance-default\health_reports\check_health.ps1"
```

## Utility Scripts

### check_health.ps1
Executes all health checks.
- **Location**: `D:\AMX-AIR-HUBS-LOCAL\instance-default\health_reports\check_health.ps1`
- **Output Logs**: `D:\AMX-AIR-HUBS-LOCAL\instance-default\health_reports\logs\AMX-AIR-HUBS-AMXLABS-YYYY-MM-DD.log`
- **Auto-repairs**:
  - Clears `npm-cache` and `.cache` if drive C: is under 20GB.
  - Automatically runs `git gc --prune=now` on `C:\Users\Techa\.paperclip` to compress loose objects.
  - Boots up Docker Desktop if the daemon is unresponsive.
  - Installs Node.js, npm, and compatible global pnpm inside the WSL Ubuntu distro if missing.

## Workflow

To inspect the results programmatically, check the logs directory:
1. Open the latest log file at `D:\AMX-AIR-HUBS-LOCAL\instance-default\health_reports\logs\`.
2. Review the status of steps 1 through 10.
3. If any step is in `[FAIL]` status, verify if the auto-repair succeeded or if manual intervention is required.

## Rate Limiting
No external APIs are used in this local check, so no rate limits apply.

## Common Mistakes
- **WSL Shutdown Interruption**: Running the check while another critical task is running in WSL may temporarily interrupt it when checking filesystem/dmesg logs.
- **Docker Desktop Path**: If Docker is installed in a non-standard path, the auto-start process might fail to find the executable.

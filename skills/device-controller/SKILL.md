---
name: device-controller
description: Controls local and global deployments across devices, performing device recognition (fetching hostname, OS, network info, active containers), running local container operations, and executing SSH command deployments to control remote VPS servers.
---

# Device Recognition and Deployment Controller

This skill enables agents to recognize host devices, manage local docker instances, and orchestrate global/remote deployments on the VPS.

## Step 1: Device Recognition (Get Host Profile)
Run shell diagnostics to identify the active execution context:
* **Local OS check**: `uname -a` (Linux/macOS) or `systeminfo` / `cmd /c ver` (Windows)
* **Active Hostname**: `hostname`
* **Docker Context**: `docker ps`
* **IP Configuration**: `ipconfig` or `ifconfig`

## Step 2: Manage Local Deployments
To control, restart, or check services running locally:
* **Check Status**: `docker compose ps`
* **Restart Service**: `docker compose restart <service-name>`
* **View Logs**: `docker compose logs --tail=50 <service-name>`

## Step 3: Manage Global/Remote Deployments
To run commands on the cloud VPS (`82.29.197.221`) using the SSH key `~/.ssh/amx_hostinger_ed25519` or `C:\Users\Techa\.ssh\amx_hostinger_ed25519`:
```bash
ssh -i ~/.ssh/amx_hostinger_ed25519 -o StrictHostKeyChecking=no root@82.29.197.221 "docker ps"
```
You can execute service restarts, database updates, or log parsing remotely.

## Step 4: Verification and Proof of Work
After running deployment operations, verify connectivity:
* **Check HTTP status**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/api/health`
* **Check VPS health**: `curl -s -o /dev/null -w "%{http_code}" https://amx-air-hubs.cc/api/health`

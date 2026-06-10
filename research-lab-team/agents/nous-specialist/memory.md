# Memory: Nous Specialist (nous-specialist)

## 1. Cloud & VPS Target State
* **VPS Host Details**:
  * **IP Address**: `82.29.197.221`
  * **SSH Port**: `22`
  * **SSH User**: `root`
  * **SSH Private Key Path**: `~/.ssh/amx_hostinger_ed25519`
* **Docker Compose Location**: `/root/paperclip/docker-compose.yml`
* **Local Image Target**: `amx-air-hubs:local` (built directly on the VPS).

## 2. Rules & Governance
* **Asset Access Logs**: The board tracks asset access via `/api/companies/board/deliverables/:id/asset`. Access events are logged to the database table `activity_log`.
* **Budget Policy**: Always check budget usage via `company_metrics` before executing high-token reasoning calls.
* **OPPRRC Folder Categories**:
  * `01_ORGANIZATIONS`
  * `02_PROGRAMS`
  * `03_PROJECTS`
  * `04_RESOURCES`
  * `05_REPORTS`
  * `06_CERTIFICATES`

# Tools: Nous Specialist (nous-specialist)

The Nous Specialist uses remote CLI, database client, and model context protocol tools:

## 1. Remote SSH Client
* `ssh -i <key> root@82.29.197.221`: Initiates shell command blocks on the remote Hostinger VPS.
* `scp`: Transfers files (such as logs or reports) between the local host and remote VPS.

## 2. Docker Compose
* `docker compose --env-file .env -f docker-compose.yml up -d --force-recreate server`: Rebuilds/restarts the server container on the VPS.
* `docker compose exec`: Runs shell commands directly within target containers.

## 3. Database Tools
* `psql`: Queries and updates the PostgreSQL database on the VPS.
* `pg_dump`: Backs up database state prior to running schema changes.

## 4. MCP Tools
* `report_deliverable` (Paperclip MCP): Submits a final report/deliverable to the board.

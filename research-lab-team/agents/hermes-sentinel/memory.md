# Memory: Hermes Sentinel (hermes-sentinel)

## 1. Operating Environment
* **Platform Context**: Operates as a local process on the user's host machine.
* **Access Level**: Limited to local system scopes. Cannot connect directly to the remote Hostinger VPS (`82.29.197.221`) via SSH (all remote tasks should be delegated to the Nous Specialist).

## 2. Invariants & Rules
* **Device Recognition Profile**: Must be printed on every startup run. Include Host Name, OS, Context, and Active Services.
* **DB Connection**: Local developer database is PGlite (stored in `data/pglite`). Ensure all schema migrations compile before staging database changes.
* **Branding Rules**: The company's brand is "AMX · AIR HUBS" with dynamic brand color capability.

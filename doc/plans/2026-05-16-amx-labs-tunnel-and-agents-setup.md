# AMX Labs Environment Setup & Cloudflare Tunnel Notes

**Date:** 2026-05-16
**Context:** Local dev setup using Cloudflare Tunnels and centralized agent configurations.

## 1. Cloudflare Tunnel Configuration
To allow external access to the AMX Labs UI and API through the Cloudflare Tunnel (`https://amx-air-hubs.cc`), specific `.env` variables are required. By default, `authenticated` deployment mode blocks public domains from accessing the local `localhost:3100` server. 

If the dev server environment rejects requests with `403 Forbidden` or Better Auth throws CORS/URL mismatch errors, ensure the `.env` at the project root contains:

```env
# Required for Cloudflare Tunnel public access
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=public
PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://amx-air-hubs.cc
PAPERCLIP_ALLOWED_HOSTNAMES=localhost,127.0.0.1,::1,amx-air-hubs.cc,www.amx-air-hubs.cc,api.amx-air-hubs.cc
BETTER_AUTH_TRUSTED_ORIGINS=https://amx-air-hubs.cc,https://www.amx-air-hubs.cc,https://api.amx-air-hubs.cc
```
*Note: Make sure to restart the dev server (`pnpm dev`) if these variables are modified.*

## 2. Agent `cwd` (Working Directory)
The AMX Labs agents execute their tasks within a specified project path. For consistency across the organization, the agents' `adapterConfig.cwd` has been forcefully migrated to the centralized OPPRRC network shortcut.

**Current AMX Labs Agent CWD Path:**
```
C:\Users\Techa\AppData\Roaming\Microsoft\Windows\Network Shortcuts\LOUISVLLE-METRO-GOV\AMX HUBS\AMX LABS\AMX-AIR-HUBS-OPPRRC
```

**How to Patch Agent CWDs Programmatically:**
If new agents are added and need to be synchronized to this path, you can run a database patch against the embedded postgres instance:

```typescript
import { createDb, agents } from '@paperclipai/db';
import { sql } from 'drizzle-orm';

const targetCwd = "C:\\Users\\Techa\\AppData\\Roaming\\Microsoft\\Windows\\Network Shortcuts\\LOUISVLLE-METRO-GOV\\AMX HUBS\\AMX LABS\\AMX-AIR-HUBS-OPPRRC";

await db.update(agents).set({
  adapterConfig: sql`jsonb_set(
    CASE WHEN adapter_config IS NULL THEN '{}'::jsonb ELSE adapter_config END,
    '{cwd}',
    ${JSON.stringify(targetCwd)}::jsonb
  )`
});
```

*This applies to the `opencode_local` adapters in the AMX Labs company. Avoid moving instructions to local temporary folders.*

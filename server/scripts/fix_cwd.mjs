import { PGlite } from "@electric-sql/pglite";
import path from "node:path";

async function main() {
  const dataDir = "C:\\Users\\Techa\\.paperclip\\instances\\default\\data\\pglite";
  const client = new PGlite(dataDir);

  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52"; // AMX LABS
  const targetCwd = "G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AIR-HUB-FOLDER-OPPRRC\\AMX-LABS";

  const res = await client.query('SELECT id, name, adapter_config FROM agents WHERE company_id = $1', [companyId]);
  
  let updatedCount = 0;
  for (const row of res.rows) {
    const config = typeof row.adapter_config === 'string' ? JSON.parse(row.adapter_config) : row.adapter_config;
    if (config?.cwd && config.cwd.startsWith("C:\\Users\\Techa\\.paperclip\\tmp_surfers\\agent-workspaces\\")) {
      console.log(`Updating agent ${row.name} (${row.id}) CWD to ${targetCwd}`);
      config.cwd = targetCwd;
      await client.query('UPDATE agents SET adapter_config = $1 WHERE id = $2', [JSON.stringify(config), row.id]);
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} agents.`);
  await client.close();
}

main().catch(console.error);

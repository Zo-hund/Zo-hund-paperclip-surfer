import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { agents } from "@paperclipai/db/schema";
import path from "node:path";

async function main() {
  const dataDir = "C:\\Users\\Techa\\.paperclip\\instances\\default\\data\\pglite";
  const client = new PGlite(dataDir);
  const db = drizzle(client);

  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52"; // AMX LABS
  const targetCwd = "G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AIR-HUB-FOLDER-OPPRRC\\AMX-LABS";

  const allAgents = await db.select().from(agents).where(eq(agents.companyId, companyId));
  
  let updatedCount = 0;
  for (const agent of allAgents) {
    const config = agent.adapterConfig as Record<string, any>;
    if (config?.cwd?.startsWith("C:\\Users\\Techa\\.paperclip\\tmp_surfers\\agent-workspaces\\")) {
      console.log(`Updating agent ${agent.name} (${agent.id}) CWD to ${targetCwd}`);
      config.cwd = targetCwd;
      await db.update(agents).set({ adapterConfig: config }).where(eq(agents.id, agent.id));
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} agents.`);
  await client.close();
}

main().catch(console.error);

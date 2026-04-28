import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./packages/db/src/schema/index";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://postgres@localhost:54329/postgres";
  const queryClient = postgres(url);
  const db = drizzle(queryClient, { schema });

  console.log("Looking for UXDesigner agent...");
  const agents = await db.query.agents.findMany({
    where: (agents, { eq }) => eq(agents.name, "UXDesigner")
  });

  if (agents.length === 0) {
    console.error("UXDesigner agent not found.");
    process.exit(1);
  }

  const uxDesigner = agents[0];
  console.log(`Found UXDesigner (ID: ${uxDesigner.id})`);

  const newCwd = "G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AGENT-DELIVERABLES\\CLIENTS-EXTERNAL\\MEDIA";

  const newAdapterConfig = {
    ...uxDesigner.adapterConfig,
    cwd: newCwd
  };

  await db.update(schema.agents)
    .set({ adapterConfig: newAdapterConfig })
    .where(eq(schema.agents.id, uxDesigner.id));
    
  console.log("Updated UXDesigner CWD in database to:", newCwd);
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

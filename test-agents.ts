import { db } from "./packages/db/src/index.ts";
import { agentService } from "./server/src/services/agents.ts";

async function main() {
  try {
    const svc = agentService(db);
    const agents = await svc.list("MEN");
    console.log("Success:", agents.length);
  } catch (err) {
    console.error("Error in list:", err);
  }
}

main().catch(console.error);

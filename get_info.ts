import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { companies, agents } from "./packages/db/src/schema/index.js";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/paperclipai";
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  const allCompanies = await db.select().from(companies).limit(1);
  const allAgents = await db.select().from(agents).limit(5);
  
  console.log("COMPANIES:", JSON.stringify(allCompanies, null, 2));
  console.log("AGENTS:", JSON.stringify(allAgents, null, 2));
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

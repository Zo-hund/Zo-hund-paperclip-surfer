import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./packages/db/src/schema/index";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://postgres@localhost:54329/postgres";
  const queryClient = postgres(url);
  const db = drizzle(queryClient, { schema });

  console.log("Checking Issues...");
  const issues = await db.query.issues.findMany({
    where: (issues, { eq }) => eq(issues.id, "AMXA-904"), // Wait, AMXA-904 is a code, not a UUID
  });
  
  // Try searching by title if ID doesn't match
  const amxa904ByTitle = await db.query.issues.findMany({
    where: (issues, { ilike }) => ilike(issues.title, "%AMXA-904%"),
  });

  console.log("Issues found:", amxa904ByTitle.length);
  amxa904ByTitle.forEach(i => console.log(`- [${i.id}] ${i.title} (Status: ${i.status})`));

  console.log("\nChecking Agents Adapter Configs...");
  const agents = await db.query.agents.findMany();
  agents.forEach(a => {
    console.log(`- ${a.name} (${a.role}):`);
    console.log(`  Adapter Config: ${JSON.stringify(a.adapterConfig, null, 2)}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

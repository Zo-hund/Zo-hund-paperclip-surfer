import { createDb, activityLog } from "@paperclipai/db";
import { desc } from "drizzle-orm";
import "dotenv/config";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  // If no DATABASE_URL, we might be in PGlite mode, which we can't easily jump into if the server is running.
  if (!databaseUrl) {
    console.error("No DATABASE_URL found. Standalone diagnostics cannot override PGlite when the server is running.");
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  const logs = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(10);
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

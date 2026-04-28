import { createDb, companies } from "@paperclipai/db";
import { ilike } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://postgres@localhost:54329/postgres";
  const db = createDb(url);
  
  const result = await db.select().from(companies).where(ilike(companies.name, "%AMX Labs%"));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

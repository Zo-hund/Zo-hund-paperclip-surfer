import { db } from "../src/db/client.js";
import { companies } from "../src/db/schema/index.js";
import { ilike } from "drizzle-orm";

async function main() {
  const result = await db.select().from(companies).where(ilike(companies.name, "%AMX Labs%"));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

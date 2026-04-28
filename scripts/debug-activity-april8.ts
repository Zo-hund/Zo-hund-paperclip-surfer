import { createDb, activity } from "@paperclipai/db";
import { eq, gte, lt, and } from "drizzle-orm";

async function main() {
  const databaseUrl = "C:\\Users\\Techa\\.paperclip\\instances\\default\\db";
  const db = await createDb(databaseUrl);
  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52";
  
  const start = new Date("2026-04-08T00:00:00Z");
  const end = new Date("2026-04-09T00:00:00Z");

  console.log(`Searching activity for ${companyId} on April 8...`);
  
  const entries = await db.select()
    .from(activity)
    .where(
      and(
        eq(activity.companyId, companyId),
        gte(activity.createdAt, start),
        lt(activity.createdAt, end)
      )
    )
    .limit(100);

  console.log(JSON.stringify(entries, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

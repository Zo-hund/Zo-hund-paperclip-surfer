import { readFile } from "node:fs/promises";
import { logger } from "./middleware/logger.js";

const STATEMENT_BREAKPOINT = "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900";

export async function executeSqlFileViaDrizzle(db: any, filePath: string) {
  logger.info({ filePath }, "Executing SQL file via existing Drizzle connection");
  const contents = await readFile(filePath, "utf8");
  const statements = contents
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let successCount = 0;
  let failCount = 0;

  for (const statement of statements) {
    const trimmed = statement.toUpperCase();
    if (trimmed === "BEGIN;" || trimmed === "COMMIT;" || trimmed === "ROLLBACK;") {
      continue;
    }
    if (statement.startsWith("--")) {
       continue;
    }
    try {
      // We use db.execute() for raw SQL chunks
      await db.execute(statement);
      successCount++;
    } catch (err) {
      failCount++;
      // Some errors might be expected (e.g. DROP TABLE on non-existent table)
      // but the backup has "DROP TABLE IF EXISTS" so it should be clean.
      logger.warn({ err, statement: statement.slice(0, 100) }, "SQL statement failed during restore");
    }
  }

  logger.info({ successCount, failCount }, "SQL file execution complete");
}

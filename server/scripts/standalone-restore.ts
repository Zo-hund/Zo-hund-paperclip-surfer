import postgres from "postgres";
import fs from "fs";
import { resolve } from "path";
import EmbeddedPostgresCtor from "embedded-postgres";

async function main() {
  const dataDir = "c:\\Users\\Techa\\.paperclip\\instances\\default\\data\\pglite";
  const port = 54329;
  const backupFile = "c:\\Users\\Techa\\.paperclip\\instances\\default\\data\\backups\\paperclip-20260409-070036.sql";

  console.log(`[RESTORE] Initializing Embedded Postgres at ${dataDir} on port ${port}...`);
  
  const embeddedPostgres = new (EmbeddedPostgresCtor as any)({
    databaseDir: dataDir,
    user: "paperclip",
    password: "paperclip",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
  });

  try {
    // Check if running
    try {
        await embeddedPostgres.start();
        console.log(`[RESTORE] Started Embedded Postgres.`);
    } catch (e) {
        console.log(`[RESTORE] Postgres might already be running or failed to start: ${e}`);
    }

    const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
    const sql = postgres(connectionString, { max: 1, connect_timeout: 30 });

    console.log(`[RESTORE] Testing connection to ${connectionString}...`);
    await sql`SELECT 1`;
    console.log(`[RESTORE] Connected.`);

    const contents = fs.readFileSync(backupFile, "utf8");
    const BREAKPOINT = "-- paperclip statement breakpoint 69f6f3f1-42fd-46a6-bf17-d1d85f8f3900";
    const statements = contents
      .split(BREAKPOINT)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`[RESTORE] Found ${statements.length} statements.`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        try {
            await sql.unsafe(statement).execute();
            successCount++;
        } catch (err) {
            failCount++;
            console.error(`\n[RESTORE] FAILED Statement #${i}`);
            console.error(`[RESTORE] Error:`, (err as any).message);
            console.error(`[RESTORE] SQL Summary: ${statement.substring(0, 500)}`);
            
            // If it's a structural error, we might want to stop.
            // But let's try to proceed to see if it's just a few bad rows.
            // Note: If inside a BEGIN/COMMIT block in the file, subsequent will fail.
            // The backup file has BEGIN/COMMIT at the very start/end usually.
            
            if ((err as any).message.includes("transaction is aborted")) {
                console.error(`[RESTORE] Transaction aborted. Issuing ROLLBACK to reset state.`);
                await sql`ROLLBACK`.execute().catch(() => {});
            }
            
            if (failCount > 20) {
                console.error(`[RESTORE] Too many errors, stopping.`);
                break;
            }
        }
    }

    console.log(`\n[RESTORE] Completed. Success: ${successCount}, Fail: ${failCount}`);
    await sql.end();

  } catch (err) {
    console.error(`[RESTORE] Fatal:`, err);
  } finally {
      try {
          await embeddedPostgres.stop();
          console.log(`[RESTORE] Stopped Embedded Postgres.`);
      } catch (e) {}
  }
}

main();

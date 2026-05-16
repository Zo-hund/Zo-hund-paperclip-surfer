import { runDatabaseRestore } from "@paperclipai/db";
import fs from "fs";

async function main() {
  const connectionString = "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
  const backupFile = "c:\\Users\\Techa\\.paperclip\\instances\\default\\data\\backups\\paperclip-20260428-144648.sql";

  console.log(`Restoring database from: ${backupFile}`);
  console.log(`Connecting to: ${connectionString}`);

  try {
    await runDatabaseRestore({
      connectionString,
      backupFile,
      connectTimeoutSeconds: 15,
    });
    console.log("Database restore completed successfully.");
  } catch (err) {
    console.error("Database restore failed:");
    console.dir(err, { depth: null });
    process.exit(1);
  }
}

main();

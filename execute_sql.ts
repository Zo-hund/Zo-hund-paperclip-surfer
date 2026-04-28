import postgres from "postgres";
import fs from "fs";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://postgres@localhost:54329/postgres";
  const sql = postgres(url);
  
  const sqlFile = fs.readFileSync("./populate_amx_labs.sql", "utf-8");
  
  console.log("Executing SQL...");
  await sql.unsafe(sqlFile);
  
  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

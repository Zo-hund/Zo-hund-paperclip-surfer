import postgres from "postgres";

async function main() {
  const sql = postgres("postgres://paperclip:paperclip@127.0.0.1:54329/postgres", {
    connect_timeout: 5,
  });
  try {
    const result = await sql`SELECT datname FROM pg_database`;
    console.log("Databases:", result.map(r => r.datname));
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await sql.end();
  }
}

main();

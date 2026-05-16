import { PGlite } from "@electric-sql/pglite";
async function main() {
  const client = new PGlite("C:\\Users\\Techa\\.paperclip\\instances\\default\\data\\pglite");
  const res = await client.query("SELECT id, name, issue_prefix FROM companies WHERE name = 'AMX LABS'");
  console.log(res.rows[0]);
  await client.close();
}
main().catch(console.error);

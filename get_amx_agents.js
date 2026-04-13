import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/paperclip');

async function main() {
  const companies = await sql`SELECT id FROM companies WHERE name ILIKE '%AMX%' LIMIT 1`;
  if (companies.length === 0) {
    console.log('No AMX company found');
    process.exit(0);
  }
  const companyId = companies[0].id;
  const agents = await sql`SELECT id, name, role FROM agents WHERE company_id = ${companyId}`;
  console.log(JSON.stringify({ companyId, agents }, null, 2));
  process.exit(0);
}
main().catch(console.error);

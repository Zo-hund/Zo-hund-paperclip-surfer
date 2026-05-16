const postgres = require('postgres');

(async () => {
  const url = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/postgres';
  const sql = postgres(url, { max: 1 });
  const companies = await sql`select id, name, slug, created_at from companies order by created_at desc limit 20`;
  const agents = await sql`select company_id, count(*)::int as count from agents group by company_id order by count desc limit 20`;
  console.log(JSON.stringify({ url, companies, agents }, null, 2));
  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

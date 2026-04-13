// CJS migration — uses the postgres.js driver already in the project
const postgres = require('./node_modules/postgres/cjs/src/index.js');

const AMX_ID  = 'b0949587-bec6-4ea5-82b1-50933b767568';
const AMXA_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52';
const HAT_ID  = '1d43eaba-e78d-4723-bd73-2707ce4a10d3';

async function run() {
  let sql;
  for (const port of [54329, 5432]) {
    try {
      sql = postgres({ host: '127.0.0.1', port, database: 'paperclip', username: 'paperclip', password: 'paperclip', max: 1, connect_timeout: 3 });
      const res = await sql`SELECT 1`;
      console.log('✅ Connected on port', port);
      break;
    } catch (e) {
      console.log('  Port', port, 'failed:', e.message.slice(0, 60));
      sql = null;
    }
  }
  if (!sql) throw new Error('Could not connect to database');

  // ── 1. Move agents AMXA → AMX ──────────────────────────────────────────────
  console.log('\n🔄 Moving agents from AMXA → AMX...');
  const moved = await sql`
    UPDATE agents SET company_id = ${AMX_ID}
    WHERE company_id = ${AMXA_ID}
    RETURNING name, status
  `;
  if (moved.length === 0) console.log('  ⚠️  No agents found in AMXA to move');
  else console.log('  Moved:', moved.map(a => `${a.name} [${a.status}]`).join(', '));

  // ── 2. Migrate related tables ───────────────────────────────────────────────
  const tables = ['issues', 'projects', 'routines', 'goals', 'activity_log',
    'cost_events', 'heartbeat_runs', 'labels', 'meetings', 'approvals', 'execution_workspaces'];
  for (const t of tables) {
    try {
      const r = await sql.unsafe(`UPDATE ${t} SET company_id = $1 WHERE company_id = $2`, [AMX_ID, AMXA_ID]);
      if (r.count > 0) console.log(`  ✅ Migrated ${t}: ${r.count} rows`);
    } catch (e) { /* table may not have company_id — skip silently */ }
  }

  // ── 3. Delete AMXA ──────────────────────────────────────────────────────────
  console.log('\n🗑️  Deleting AMXA company...');
  try {
    await sql`DELETE FROM agents WHERE company_id = ${AMXA_ID}`;
    await sql`DELETE FROM companies WHERE id = ${AMXA_ID}`;
    console.log('  ✅ AMXA deleted');
  } catch (e) {
    console.warn('  ⚠️  AMXA delete failed:', e.message.slice(0, 100));
  }

  // ── 4. Delete test companies ─────────────────────────────────────────────────
  const all = await sql`SELECT id, issue_prefix, name FROM companies WHERE id != ${HAT_ID} AND id != ${AMX_ID} ORDER BY issue_prefix`;
  console.log(`\n🗑️  Cleaning up ${all.length} test company/companies...`);
  for (const c of all) {
    try {
      const [{ cnt }] = await sql`SELECT COUNT(*) cnt FROM agents WHERE company_id = ${c.id}`;
      if (parseInt(cnt) > 0) { console.log(`  ⚠️  Skipping [${c.issue_prefix}] — has ${cnt} agent(s)`); continue; }
      await sql.unsafe(`DELETE FROM companies WHERE id = $1`, [c.id]);
      console.log(`  ✅ Deleted [${c.issue_prefix}] ${c.name}`);
    } catch (e) {
      console.warn(`  ⚠️  ${c.issue_prefix}: ${e.message.slice(0, 100)}`);
    }
  }

  // ── 5. Final verification ────────────────────────────────────────────────────
  console.log('\n📊 FINAL STATE:');
  const final = await sql`SELECT issue_prefix, name, id FROM companies ORDER BY name`;
  for (const c of final) {
    const ags = await sql`SELECT name, status FROM agents WHERE company_id = ${c.id}`;
    const agStr = ags.length > 0 ? ags.map(a => `${a.name} [${a.status}]`).join(', ') : '(no agents)';
    console.log(`  [${c.issue_prefix}] ${c.name}: ${agStr}`);
  }

  await sql.end();
  console.log('\n✅ Migration complete!');
}

run().catch(e => { console.error('\n❌ FAILED:', e.message); process.exit(1); });

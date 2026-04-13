/**
 * Data Migration using the 'postgres' (postgres.js) driver already installed
 * Migrates agents from AMXA → AMX and deletes test companies
 */

import postgres from 'postgres';

// Use the DB URL from pnpm dev environment (port 54329 for local embedded postgres)
const DB_URLS = [
  'postgres://paperclip:paperclip@localhost:54329/paperclip',
  'postgres://paperclip:paperclip@127.0.0.1:54329/paperclip',
  'postgres://paperclip:paperclip@localhost:5432/paperclip',
  'postgres://paperclip:paperclip@127.0.0.1:5432/paperclip',
];

const API = 'http://127.0.0.1:3100/api';

async function get(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function connectDb() {
  for (const url of DB_URLS) {
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 5 });
      await sql`SELECT 1`;
      console.log(`✅ Connected to DB: ${url}`);
      return sql;
    } catch (e) {
      console.log(`  ✗ ${url}: ${e.message.substring(0, 60)}`);
    }
  }
  throw new Error('Could not connect to any DB URL');
}

async function main() {
  const companies = await get('/companies');
  
  console.log(`\n=== COMPANY + AGENT AUDIT (${companies.length} companies) ===`);
  companies.forEach(c => console.log(`  [${c.issuePrefix}] ${c.name} | ${c.id}`));

  const amx  = companies.find(c => c.issuePrefix === 'AMX');
  const amxa = companies.find(c => c.issuePrefix === 'AMXA');
  if (!amx || !amxa) throw new Error('AMX or AMXA not found');

  console.log(`\n🔌 Connecting to database...`);
  const sql = await connectDb();

  // ── Step 1: Move agents ──────────────────────────────────────────────────────
  console.log('\n🔄 Moving agents from AMXA → AMX...');
  const agents = await sql`SELECT id, name, status FROM agents WHERE company_id = ${amxa.id}`;
  console.log(`  Found: ${agents.map(a => a.name).join(', ')}`);

  await sql`UPDATE agents SET company_id = ${amx.id} WHERE company_id = ${amxa.id}`;
  console.log(`  ✅ ${agents.length} agent(s) moved to AMX`);

  // ── Step 2: Move all related data rows ───────────────────────────────────────
  const tables = [
    'issues', 'projects', 'routines', 'goals',
    'cost_events', 'activity_log', 'heartbeat_runs',
    'execution_workspaces', 'issue_work_products',
    'agent_memories', 'agent_kpis', 'agent_runtime_state',
    'labels', 'meetings', 'approvals',
  ];

  for (const table of tables) {
    try {
      const result = await sql.unsafe(
        `UPDATE ${table} SET company_id = $1 WHERE company_id = $2`,
        [amx.id, amxa.id]
      );
      if (result.count > 0) console.log(`  ✅ Migrated ${table}: ${result.count} rows`);
    } catch (e) {
      if (!e.message.includes('does not exist') && !e.message.includes('column "company_id"')) {
        console.warn(`  ⚠️  ${table}: ${e.message.substring(0, 80)}`);
      }
    }
  }

  // ── Step 3: Verify ───────────────────────────────────────────────────────────
  const verified = await sql`SELECT name, status FROM agents WHERE company_id = ${amx.id}`;
  console.log(`\n✅ AMX now has ${verified.length} agent(s):`);
  verified.forEach(a => console.log(`   • ${a.name} [${a.status}]`));

  // ── Step 4: Delete AMXA (now empty) ─────────────────────────────────────────
  console.log('\n🗑️  Cleaning up empty AMXA company...');
  try {
    await sql`DELETE FROM agents WHERE company_id = ${amxa.id}`;
    await sql`DELETE FROM companies WHERE id = ${amxa.id}`;
    console.log('  ✅ AMXA deleted');
  } catch (e) {
    console.warn('  ⚠️  AMXA delete:', e.message.substring(0, 100));
  }

  // ── Step 5: Delete test companies (no agents, FB/SOC clones) ─────────────────
  const deleteTargets = companies.filter(c =>
    c.id !== amx.id && c.id !== amxa.id && c.issuePrefix !== 'HAT' &&
    (c.issuePrefix.startsWith('FBM') || c.issuePrefix.startsWith('SOC'))
  );
  
  console.log(`\n🗑️  Deleting ${deleteTargets.length} test/duplicate companies...`);
  for (const c of deleteTargets) {
    try {
      const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM agents WHERE company_id = ${c.id}`;
      if (parseInt(cnt) > 0) { console.log(`  ⚠️  Skipping ${c.issuePrefix} — has ${cnt} agent(s)`); continue; }
      await sql`DELETE FROM companies WHERE id = ${c.id}`;
      console.log(`  ✅ Deleted [${c.issuePrefix}] ${c.name}`);
    } catch (e) {
      // Try cascading approach — remove dependencies first
      try {
        await sql.unsafe(`DELETE FROM agents WHERE company_id = '${c.id}'`);
        await sql.unsafe(`DELETE FROM companies WHERE id = '${c.id}'`);
        console.log(`  ✅ Deleted [${c.issuePrefix}] ${c.name} (with cascade)`);
      } catch (e2) {
        console.warn(`  ⚠️  ${c.issuePrefix}: ${e2.message.substring(0, 100)}`);
      }
    }
  }

  // ── Step 6: Final state ──────────────────────────────────────────────────────
  console.log('\n📊 Final state:');
  const final = await sql`SELECT issue_prefix, name FROM companies ORDER BY name`;
  for (const c of final) {
    const ags = await sql`SELECT name, status FROM agents WHERE company_id = (SELECT id FROM companies WHERE issue_prefix = ${c.issue_prefix})`;
    const agStr = ags.length > 0 ? ags.map(a => `${a.name}[${a.status}]`).join(', ') : '(no agents)';
    console.log(`  [${c.issue_prefix}] ${c.name}: ${agStr}`);
  }

  await sql.end();
  console.log('\n✅ Migration complete!');
}

main().catch(e => { console.error('\n❌ Failed:', e.message); process.exit(1); });

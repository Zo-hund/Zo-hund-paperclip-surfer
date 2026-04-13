const r = await fetch('http://127.0.0.1:3100/api/companies');
const companies = await r.json();
console.log(`\n=== COMPANY + AGENT AUDIT (${companies.length} companies) ===\n`);
for (const c of companies) {
  const ar = await fetch(`http://127.0.0.1:3100/api/companies/${c.id}/agents`);
  const agents = await ar.json();
  const cnt = Array.isArray(agents) ? agents.length : '?';
  const names = Array.isArray(agents) && agents.length > 0
    ? agents.map(a => `  • ${a.name} [${a.status}]`).join('\n')
    : '  (none)';
  console.log(`[${c.issuePrefix}] ${c.name} — ${cnt} agent(s)\n${names}`);
}

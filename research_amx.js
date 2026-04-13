import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/paperclip');

async function main() {
  const companies = await sql`SELECT id, name FROM companies WHERE name ILIKE '%AMX%'`;
  console.log("Companies:", JSON.stringify(companies, null, 2));
  
  if (companies.length > 0) {
    const companyId = companies[0].id;
    const agents = await sql`SELECT id, name, role, capabilities, permissions FROM agents WHERE company_id = ${companyId}`;
    console.log("Agents:", JSON.stringify(agents, null, 2));
    
    const mcpServers = await sql`SELECT id, name, enabled FROM company_mcp_servers WHERE company_id = ${companyId}`;
    console.log("MCP Servers:", JSON.stringify(mcpServers, null, 2));
  }
  
  process.exit(0);
}
main().catch(console.error);

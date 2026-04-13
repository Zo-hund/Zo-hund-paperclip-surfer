import { db, companies, companyMcpServers } from '@paperclipai/db';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('Registering Firecrawl MCP server...');

  // 1. Get the first company
  const [company] = await db.select().from(companies).limit(1);
  if (!company) {
    console.error('No company found in database.');
    process.exit(1);
  }
  console.log(`Found company: ${company.name} (${company.id})`);

  // 2. Check if firecrawl already exists
  const [existing] = await db
    .select()
    .from(companyMcpServers)
    .where(eq(companyMcpServers.name, 'firecrawl'))
    .limit(1);

  if (existing) {
    console.log('Firecrawl MCP server already registered. Updating...');
    await db
      .update(companyMcpServers)
      .set({
        command: 'npx',
        args: ['-y', 'firecrawl-cli', 'mcp'],
        env: {
          FIRECRAWL_API_KEY: 'fc-d9a88608cf364e5a96b5e5bead9ef502'
        },
        updatedAt: new Date(),
      })
      .where(eq(companyMcpServers.id, existing.id));
  } else {
    console.log('Registering new Firecrawl MCP server...');
    await db.insert(companyMcpServers).values({
      id: uuidv4(),
      companyId: company.id,
      name: 'firecrawl',
      description: 'Web research and data extraction using Firecrawl',
      command: 'npx',
      args: ['-y', 'firecrawl-cli', 'mcp'],
      env: {
        FIRECRAWL_API_KEY: 'fc-d9a88608cf364e5a96b5e5bead9ef502'
      },
      transportType: 'stdio',
      source: 'manual',
      scope: 'company',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log('Firecrawl MCP server registered successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error registering Firecrawl:', err);
  process.exit(1);
});

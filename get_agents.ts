import { db } from './packages/db/src';
import { agents } from './packages/db/src/schema';

async function main() {
  const allAgents = await db.select().from(agents);
  for (const agent of allAgents) {
    console.log(`Agent ID: ${agent.id}`);
    console.log(`Name: ${agent.name}`);
    console.log(`Shortname: ${agent.shortname}`);
    console.log(`Company ID: ${agent.companyId}`);
    console.log(`Status: ${agent.status}`);
    console.log(`Live Status: ${agent.liveStatus}`);
    console.log('---');
  }
}

main().catch(console.error);

import { loadConfig } from '../src/config.js';
import { createDb, activityLog } from '@paperclipai/db';
import { desc, and, gte, lte, count } from 'drizzle-orm';

async function main() {
  const config = loadConfig();
  const db = createDb(config.databaseUrl || 'postgres://paperclip:paperclip@127.0.0.1:54329/paperclip');
  
  const total = await db.select({ value: count() }).from(activityLog);
  console.log('Total activity logs:', total[0].value);

  const start = new Date('2026-04-08T00:00:00Z');
  const end = new Date('2026-04-08T23:59:59Z');
  const results = await db.select().from(activityLog).where(and(gte(activityLog.createdAt, start), lte(activityLog.createdAt, end))).orderBy(desc(activityLog.createdAt)).limit(10);
  
  console.log('Activity logs for April 8:', JSON.stringify(results, null, 2));
}

main().catch(console.error);

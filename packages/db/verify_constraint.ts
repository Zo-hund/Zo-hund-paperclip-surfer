import { createDb, heartbeatRuns, issues } from "./src/index.js";
import { eq, isNotNull } from "drizzle-orm";

async function main() {
  const url = "postgres://paperclip:paperclip@localhost:54329/paperclip";
  const db = createDb(url);
  
  console.log("Checking locked issues and their heartbeat runs...");
  const results = await db
    .select({
      issueId: issues.id,
      issueKey: issues.identifier,
      issueTitle: issues.title,
      executionRunId: issues.executionRunId,
      runStatus: heartbeatRuns.status,
    })
    .from(issues)
    .leftJoin(heartbeatRuns, eq(issues.executionRunId, heartbeatRuns.id))
    .where(isNotNull(issues.executionRunId));

  console.log(`Found ${results.length} locked issues:`);
  for (const row of results) {
    console.log(`- Issue: ${row.issueKey} (${row.issueId})`);
    console.log(`  Title: ${row.issueTitle}`);
    console.log(`  Execution Run ID: ${row.executionRunId}`);
    console.log(`  Run Status: ${row.runStatus}`);
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

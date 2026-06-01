import { db } from './index';
import { agents, issues, heartbeatRuns, agentRuntimeState, companies } from './schema';
import { eq, inArray, desc } from 'drizzle-orm';

async function main() {
  const amxCompany = await db.query.companies.findFirst({
    where: eq(companies.name, 'AMX-LABS')
  });

  if (!amxCompany) {
    console.error('AMX-LABS not found');
    return;
  }

  const amxAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, amxCompany.id)
  });

  const runningAgents = amxAgents.filter(a => a.status === 'running');
  
  for (const agent of runningAgents) {
    console.log(`\n=== Agent: ${agent.name} (${agent.id}) ===`);
    
    // Check assigned issues
    const assignedIssues = await db.query.issues.findMany({
      where: eq(issues.assigneeAgentId, agent.id),
      with: {
        labels: true
      }
    });
    
    const inProgressIssues = assignedIssues.filter(i => i.status === 'in_progress');
    if (inProgressIssues.length > 0) {
      console.log(`- Working on Issue: "${inProgressIssues[0].title}" (Status: ${inProgressIssues[0].status})`);
    } else {
      console.log(`- No 'in_progress' issues. Assigned ${assignedIssues.length} total issues.`);
    }

    // Check latest heartbeat run
    const recentHeartbeats = await db.query.heartbeatRuns.findMany({
      where: eq(heartbeatRuns.agentId, agent.id),
      orderBy: [desc(heartbeatRuns.createdAt)],
      limit: 1
    });

    if (recentHeartbeats.length > 0) {
      const hb = recentHeartbeats[0];
      console.log(`- Last Heartbeat Run: [${hb.status}] Created: ${hb.createdAt.toISOString()}, Reason: ${hb.triggerReason}`);
      if (hb.status === 'running') {
        console.log(`  => Currently executing a heartbeat routine!`);
      }
    } else {
      console.log(`- No heartbeat runs found.`);
    }

    // Check runtime state
    const runtimeState = await db.query.agentRuntimeState.findFirst({
      where: eq(agentRuntimeState.agentId, agent.id)
    });

    if (runtimeState) {
      console.log(`- Runtime State: currentRunId=${runtimeState.currentRunId}, isBusy=${runtimeState.isBusy}, lastActiveAt=${runtimeState.lastActiveAt?.toISOString()}`);
    } else {
      console.log(`- No runtime state recorded.`);
    }
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

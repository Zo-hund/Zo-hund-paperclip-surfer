async function main() {
  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52";
  const targetCwd = "G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AIR-HUB-FOLDER-OPPRRC\\AMX-LABS";
  
  const res = await fetch(`http://localhost:3100/api/companies/${companyId}/agents`);
  const agents = await res.json();
  
  let updatedCount = 0;
  for (const agent of agents) {
    const config = agent.adapterConfig;
    if (config?.cwd && config.cwd.startsWith("C:\\Users\\Techa\\.paperclip\\tmp_surfers\\agent-workspaces\\")) {
      console.log(`Updating agent ${agent.name} (${agent.id})`);
      
      const updatePayload = {
        name: agent.name,
        role: agent.role,
        title: agent.title,
        icon: agent.icon,
        capabilities: agent.capabilities,
        status: agent.status,
        adapterType: agent.adapterType,
        adapterConfig: {
          ...config,
          cwd: targetCwd
        },
        runtimeConfig: agent.runtimeConfig,
        budgetMonthlyCents: agent.budgetMonthlyCents,
        scheduleEnabled: agent.scheduleEnabled,
        cronExpression: agent.cronExpression,
        scheduleTimezone: agent.scheduleTimezone,
        metadata: agent.metadata,
        reportsTo: agent.reportsTo,
      };
      
      const updateRes = await fetch(`http://localhost:3100/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });
      
      if (!updateRes.ok) {
        console.error(`Failed to update ${agent.id}: ${await updateRes.text()}`);
      } else {
        updatedCount++;
      }
    }
  }
  
  console.log(`Updated ${updatedCount} agents via API.`);
}

main().catch(console.error);

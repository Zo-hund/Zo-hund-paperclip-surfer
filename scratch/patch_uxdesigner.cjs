const fs = require('fs');

async function main() {
  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52";
  const baseUrl = "http://localhost:3100/api";

  const res = await fetch(`${baseUrl}/companies/${companyId}/agents`);
  const agents = await res.json();
  const uxDesigner = agents.find(a => a.name === "UXDesigner");

  if (!uxDesigner) {
    console.error("UXDesigner not found");
    return;
  }

  const newConfig = {
    ...uxDesigner.adapterConfig,
    cwd: "G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AGENT-DELIVERABLES\\CLIENTS-EXTERNAL\\MEDIA"
  };

  console.log(`Patching Agent ${uxDesigner.id}...`);

  const patchRes = await fetch(`${baseUrl}/agents/${uxDesigner.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adapterConfig: newConfig })
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error("Failed to patch:", err);
  } else {
    console.log("Successfully updated UXDesigner cwd");
  }
}

main();

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function main() {
  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52";
  const baseUrl = "http://localhost:3100/api";

  console.log("--- Fetching Issues ---");
  const issuesRes = await fetch(`${baseUrl}/companies/${companyId}/issues`);
  const issues = await issuesRes.json();
  
  const targetIssue = issues.find(i => i.title.includes("AMXA-904") || i.id === "AMXA-904");
  if (targetIssue) {
    console.log("Found Issue AMXA-904:", JSON.stringify(targetIssue, null, 2));
    
    // Check attachments
    const attachmentsRes = await fetch(`${baseUrl}/issues/${targetIssue.id}/attachments`);
    const attachments = await attachmentsRes.json();
    console.log("Attachments for AMXA-904:", JSON.stringify(attachments, null, 2));
  } else {
    console.log("Issue AMXA-904 not found in title list.");
    // Print first 5 issues to see format
    console.log("Recent issues samples:", issues.slice(0, 5).map(i => i.title));
  }

  console.log("\n--- Fetching Agents ---");
  const agentsRes = await fetch(`${baseUrl}/companies/${companyId}/agents`);
  const agents = await agentsRes.json();
  agents.forEach(a => {
    console.log(`Agent: ${a.name} (${a.role})`);
    console.log(`CWD/Config:`, JSON.stringify(a.adapterConfig, null, 2));
  });
}

main().catch(console.error);

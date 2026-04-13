const API_URL = "http://127.0.0.1:3100/api";

async function run() {
  console.log("Starting API Test Run...");

  // 1. Create Company
  const companyRes = await fetch(`${API_URL}/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Social Media Test Co",
      description: "Testing the Briefcase with an FB Ad"
    })
  });
  const company = await companyRes.json();
  if (company.error) throw new Error(`Company creation failed: ${company.error}`);
  console.log("Created Company:", company.id);

  // 2. Create Agent
  const agentRes = await fetch(`${API_URL}/companies/${company.id}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Ad Creator Agent",
      role: "content",
      adapterType: "gemini_local",
      adapterConfig: { model: "gemini-2.0-flash" }
    })
  });
  const agent = await agentRes.json();
  if (agent.error) throw new Error(`Agent creation failed: ${agent.error}`);
  console.log("Created Agent:", agent.id);

  // 3. Create Issue
  const issueRes = await fetch(`${API_URL}/companies/${company.id}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Create FB Social Media Ad",
      description: "Design a high-converting ad for Facebook.",
      status: "done",
      priority: "high",
      assigneeAgentId: agent.id
    })
  });
  const issue = await issueRes.json();
  if (issue.error) throw new Error(`Issue creation failed: ${issue.error}`);
  console.log("Created Issue:", issue.id);

  // 4. Create Work Product
  const wpRes = await fetch(`${API_URL}/issues/${issue.id}/work-products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "preview",
      title: "Facebook Ad Campaign v1",
      url: "https://facebook.com/ads/test-v1",
      status: "active",
      healthStatus: "healthy",
      isPrimary: true
    })
  });
  const wp = await wpRes.json();
  if (wp.error) throw new Error(`Work Product creation failed: ${wp.error}`);
  console.log("Created Work Product (Deliverable):", wp.id);

  console.log("\n--- TEST RUN COMPLETE ---");
  console.log(`Company ID: ${company.id}`);
  console.log(`Issue ID: ${issue.id}`);
  console.log(`Deliverable ID: ${wp.id}`);
  console.log("You can now see this in the Master Briefcase or the Social Media Test Co Dashboard.");
}

run().catch(console.error);

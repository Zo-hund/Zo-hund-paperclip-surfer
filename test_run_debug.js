const API_URL = "http://127.0.0.1:3100/api";

async function run() {
  console.log("Starting API Test Run (Debug Mode)...");

  async function post(path, body) {
    console.log(`POST ${path}...`);
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log(`Response Status: ${res.status}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      console.log(`Failed to parse JSON: ${text.substring(0, 500)}`);
      throw e;
    }
  }

  try {
    // 1. Create Company
    const company = await post("/companies", {
      name: "FB Marketing Hub",
      description: "Industrializing social media deliverables",
      issuePrefix: "FB",
      status: "active"
    });
    if (company.error) throw new Error(company.error);
    console.log("Created Company:", company.id);

    // 2. Create Agent
    const agent = await post(`/companies/${company.id}/agents`, {
      name: "AdStrategy-GPT",
      role: "content",
      adapterType: "gemini_local",
      adapterConfig: { model: "gemini-2.0-flash" }
    });
    console.log("Created Agent:", agent.id);

    // 3. Create Issue
    const issue = await post(`/companies/${company.id}/issues`, {
      title: "Generate Facebook Ad Creative",
      description: "Create a carousel ad for the new product launch.",
      status: "done",
      priority: "high",
      assigneeAgentId: agent.id
    });
    console.log("Created Issue:", issue.id);

    // 4. Create Work Product
    const wp = await post(`/issues/${issue.id}/work-products`, {
      type: "preview_url",
      provider: "manual",
      title: "LIVE Social Media Placement - Q2 Launch",
      url: "https://www.facebook.com/ads/library/?id=784512963021",
      status: "active",
      healthStatus: "healthy",
      isPrimary: true
    });
    console.log("Created Deliverable:", wp.id);

  } catch (err) {
    console.error("Test Run Failed:", err.message);
  }
}

run();

const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52";
  const baseUrl = "http://localhost:3100/api";

  console.log("--- RESEARCH RESULTS ---");

  try {
    const issues = await get(`${baseUrl}/companies/${companyId}/issues`);
    const amxa904 = issues.find(i => i.title && i.title.includes('AMXA-904'));
    if (amxa904) {
      console.log(`[PASS] Issue AMXA-904 found: "${amxa904.title}" (Status: ${amxa904.status})`);
      const attachments = await get(`${baseUrl}/issues/${amxa904.id}/attachments`);
      console.log(`[INFO] Attachments found: ${attachments.length}`);
      attachments.forEach(a => console.log(`  - ${a.originalFilename} (${a.assetId})`));
    } else {
      console.log("[FAIL] Issue AMXA-904 not found in issues list.");
    }

    const agents = await get(`${baseUrl}/companies/${companyId}/agents`);
    console.log(`[INFO] Checking 5 agents for CWD updates...`);
    agents.forEach(a => {
      const cwd = a.adapterConfig?.cwd || a.adapterConfig?.paperclipSkillSync?.cwd || 'NOT FOUND';
      console.log(`  - Agent: ${a.name} (${a.role}) | CWD: ${cwd}`);
    });

  } catch (e) {
    console.error("Error during research:", e.message);
  }
}

main();

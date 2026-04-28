const fs = require('fs');

async function main() {
  const companyId = "dece557d-8849-4040-b8ad-e0e235a54b52";
  const baseUrl = "http://localhost:3100/api";

  const res = await fetch(`${baseUrl}/companies/${companyId}/agents`);
  const agents = await res.json();
  
  const header = `
> paperclip@ paperclipai C:\\Users\\Techa\\.paperclip\\tmp_surfers
> node cli/node_modules/tsx/dist/cli.mjs cli/src/index.ts "agent" "list" "--company-id" "dece557d-8849-4040-b8ad-e0e235a54b52" "--json"

`;

  fs.writeFileSync('agents.json', header + JSON.stringify(agents, null, 2) + '\n');
  console.log('agents.json exported');
}

main();

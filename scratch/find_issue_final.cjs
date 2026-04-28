const fs = require('fs');

try {
  const issues = JSON.parse(fs.readFileSync('scratch/issues_clean.json', 'utf8'));
  const targetIssue = issues.find(i => i.title && i.title.includes('AMXA-904'));

  if (targetIssue) {
    console.log('--- FOUND ISSUE AMXA-904 ---');
    console.log(`ID: ${targetIssue.id}`);
    console.log(`Title: ${targetIssue.title}`);
    console.log(`Status: ${targetIssue.status}`);
    console.log(`Description Snippet: ${targetIssue.description?.substring(0, 100)}...`);
  } else {
    console.log('--- ISSUE AMXA-904 NOT FOUND ---');
    console.log('Sample Issue Titles:');
    issues.slice(0, 10).forEach(i => console.log(`- ${i.title}`));
  }
} catch (e) {
  console.error('Error parsing JSON:', e.message);
}

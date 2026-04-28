const fs = require('fs');

const issues = JSON.parse(fs.readFileSync('scratch/issues.json', 'utf8'));
const targetIssue = issues.find(i => i.title && i.title.includes('AMXA-904'));

if (targetIssue) {
  console.log('--- FOUND ISSUE AMXA-904 ---');
  console.log(JSON.stringify(targetIssue, null, 2));
} else {
  console.log('--- ISSUE AMXA-904 NOT FOUND ---');
  console.log('Sample Issue Titles:');
  issues.slice(0, 10).forEach(i => console.log(`- ${i.title}`));
}

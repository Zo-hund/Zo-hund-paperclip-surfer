const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3100/AMXA/briefcase', { waitUntil: 'networkidle', timeout: 60000 });
  const body = await page.locator('body').innerText();
  const needles = ['WO-SIM-001','WO-SIM-002','Master Briefcase','Deliverables','TECH AT NITE'];
  const found = Object.fromEntries(needles.map(n => [n, body.includes(n)]));
  console.log(JSON.stringify({ title: await page.title(), found }, null, 2));
  await browser.close();
})();

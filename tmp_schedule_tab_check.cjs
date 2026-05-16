const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => { if (msg.type() === 'error') logs.push(msg.text()); });
  await page.goto('http://127.0.0.1:3100/AMXA/dashboard', { waitUntil: 'networkidle' });
  const scheduleTab = page.getByText('Schedule', { exact: true }).first();
  const exists = await scheduleTab.count();
  if (!exists) {
    console.log(JSON.stringify({ found: false, url: page.url(), logs }, null, 2));
    await browser.close();
    return;
  }
  await scheduleTab.click();
  await page.waitForTimeout(1500);
  console.log(JSON.stringify({ found: true, url: page.url(), hasScheduleHeading: await page.getByText('Team Booking Schedule', { exact: false }).first().isVisible().catch(() => false), logs }, null, 2));
  await browser.close();
})();
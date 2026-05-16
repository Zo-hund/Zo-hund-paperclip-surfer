const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3100/AMXA/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  const bodyText = await page.locator('body').innerText();
  console.log(JSON.stringify({ title: await page.title(), url: page.url(), bodyPreview: bodyText.slice(0, 1200) }, null, 2));
  await browser.close();
})();

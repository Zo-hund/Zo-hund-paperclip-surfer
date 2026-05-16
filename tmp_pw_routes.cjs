const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const routes = [
    'http://127.0.0.1:3100/AMXA/dashboard',
    'http://127.0.0.1:3100/pit-stop',
    'http://127.0.0.1:3100/AMXA/briefcase',
    'http://127.0.0.1:3100/AMXA/lms/dashboard',
    'http://127.0.0.1:3100/AMXA/audit/team',
    'http://127.0.0.1:3100/AMXA/issues/AMXA-1938'
  ];
  const results = [];
  const consoleErrors = [];
  page.on('console', msg => {
    if (['error','warning'].includes(msg.type())) consoleErrors.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => consoleErrors.push({ type: 'pageerror', text: String(err) }));
  for (const url of routes) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      const bodyText = await page.locator('body').innerText();
      results.push({ url, ok: true, title: await page.title(), finalUrl: page.url(), bodyPreview: bodyText.slice(0, 500) });
    } catch (err) {
      results.push({ url, ok: false, error: String(err) });
    }
  }
  console.log(JSON.stringify({ results, consoleErrors: consoleErrors.slice(0, 20) }, null, 2));
  await browser.close();
})();

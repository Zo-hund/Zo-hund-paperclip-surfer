const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3100/AMXA/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  const links = await page.$$eval('a', as => as.map(a => ({ text: (a.textContent||'').trim(), href: a.href })).filter(x => x.text));
  const interesting = links.filter(x => /Pit Stop|TECH AT NITE|Loop|Master Briefcase|briefcase|booking|audit|Live|Dashboard/i.test(x.text));
  console.log(JSON.stringify(interesting, null, 2));
  await browser.close();
})();

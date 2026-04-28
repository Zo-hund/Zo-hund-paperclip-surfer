import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on("console", (msg) => {
    console.log("BROWSER_CONSOLE:", msg.type(), msg.text());
  });

  page.on("pageerror", (err) => {
    console.error("BROWSER_PAGEERROR:", err);
  });

  console.log("Navigating...");
  await page.goto("http://127.0.0.1:3103/meetings", { waitUntil: "domcontentloaded" });

  console.log("Waiting for Start new Meeting...");
  try {
    const startButton = page.locator("text=Start new Meeting");
    await startButton.waitFor({ state: "visible", timeout: 10000 });
    await startButton.click();
    console.log("Clicked Start new Meeting.");
  } catch (err) {
    console.log("Could not find/click Start new meeting. Assuming already in meeting.");
  }

  try {
    // Wait for the meeting to load and the AI ON button to appear
    console.log("Waiting for AI OFF button...");
    const aiButton = page.locator('button[title="Toggle Gemini Live"]');
    await aiButton.waitFor({ state: "visible", timeout: 10000 });
    console.log("Clicking AI OFF to turn ON...");
    await aiButton.click();
  } catch (err) {
    console.error("Failed to click AI ON button", err);
  }

  console.log("Waiting 8 seconds for WebSocket to settle...");
  await page.waitForTimeout(8000);

  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

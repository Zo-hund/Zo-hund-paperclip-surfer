import { test, expect } from "@playwright/test";
import * as fs from "fs";

test("debug profile page", async ({ page, baseURL }) => {
  const logLines: string[] = [];

  page.on("console", (msg) => {
    logLines.push(`[CONSOLE ${msg.type()}]: ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    logLines.push(`[PAGE ERROR]: ${err.stack || err.message}`);
  });

  page.on("requestfailed", (req) => {
    logLines.push(`[REQUEST FAILED]: ${req.url()} - ${req.failure()?.errorText}`);
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      logLines.push(`[HTTP ${res.status()}]: ${res.url()}`);
    }
  });

  const url = `${baseURL}/profile`;
  logLines.push(`Navigating to ${url}...`);
  await page.goto(url);
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch (err) {
    logLines.push(`Wait for networkidle timed out: ${err.message}`);
  }

  logLines.push(`Page title: ${await page.title()}`);
  logLines.push("---- HTML CONTENT START ----");
  logLines.push(await page.content());
  logLines.push("---- HTML CONTENT END ----");

  fs.writeFileSync("debug_profile_output.txt", logLines.join("\n"), "utf-8");
});

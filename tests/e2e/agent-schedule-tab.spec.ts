import { expect, test } from "@playwright/test";

test("agent schedule tab stays active after click", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/agents`, { waitUntil: "networkidle" });

  const agentLink = page.locator('a[href*="/agents/"]').filter({ hasText: /.+/ }).first();
  await expect(agentLink).toBeVisible();
  await agentLink.click();
  await page.waitForLoadState("networkidle");

  const scheduleTab = page.getByRole("tab", { name: "Schedule" }).first();
  await expect(scheduleTab).toBeVisible();
  await scheduleTab.click();

  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/agents\/.+\/schedule$/);
  await expect(page.getByText("Team Booking Schedule", { exact: false }).first()).toBeVisible();
});

import { expect, test } from "@playwright/test";

type Company = {
  id: string;
  issuePrefix: string;
};

async function getFirstCompany(page: import("@playwright/test").Page): Promise<Company> {
  const res = await page.request.get("/api/companies");
  expect(res.ok()).toBe(true);
  const companies = (await res.json()) as Company[];
  expect(companies.length).toBeGreaterThan(0);
  return companies[0]!;
}

test.describe("communications cockpit smoke", () => {
  test.use({ permissions: ["microphone", "camera"] });

  test("dashboard + meeting hub cockpit renders comm controls", async ({ page }) => {
    const company = await getFirstCompany(page);

    await page.goto(`/${company.issuePrefix}/dashboard`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/dashboard|command center/i);

    await page.goto(`/${company.issuePrefix}/meetings`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /Start Live Meeting/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Ask your agents/i)).toBeVisible();

    await page.getByRole("button", { name: /Start Live Meeting/i }).click();
    await expect(page.getByTitle("Toggle camera")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle("Toggle screen share")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle("Toggle Gemini Live")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Gemini Vision|TELEMETRY FEED/i);
  });
});

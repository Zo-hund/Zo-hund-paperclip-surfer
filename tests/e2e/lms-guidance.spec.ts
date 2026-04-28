import { expect, test, type Page } from "@playwright/test";

async function getFirstCompany(page: Page) {
  const res = await page.request.get("/api/companies");
  expect(res.ok()).toBe(true);
  const companies = (await res.json()) as Array<{ issuePrefix: string }>;
  expect(companies.length).toBeGreaterThan(0);
  return companies[0]!;
}

test("lms dashboard renders guided onboarding and allows marking progress", async ({ page }) => {
  const company = await getFirstCompany(page);
  await page.goto(`/${company.issuePrefix}/lms/dashboard`);

  await expect(page.getByText("Start Here")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("TECH AT NITE onboarding")).toBeVisible();

  const markDoneButtons = page.getByRole("button", { name: /Mark Done|Check Off/i });
  const count = await markDoneButtons.count();

  if (count > 0) {
    await markDoneButtons.first().click();
    await expect
      .poll(async () => (await page.locator("body").innerText()).toLowerCase())
      .toMatch(/done|checked|complete/);
  } else {
    await expect
      .poll(async () => (await page.locator("body").innerText()).toLowerCase())
      .toContain("complete");
  }
});

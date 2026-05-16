import { expect, test, type Page } from "@playwright/test";

async function getFirstCompany(page: Page) {
  const res = await page.request.get("/api/companies");
  expect(res.ok()).toBe(true);
  const companies = (await res.json()) as Array<{ issuePrefix: string }>;
  expect(companies.length).toBeGreaterThan(0);
  return companies[0]!;
}

test("unprefixed pit-stop route redirects into the active company scope", async ({ page }) => {
  const company = await getFirstCompany(page);

  await page.goto("/pit-stop", { waitUntil: "networkidle" });

  await expect(page).toHaveURL(new RegExp(`/${company.issuePrefix}/pit-stop$`));
  await expect(page).toHaveTitle(/Pit Stop/i);
});

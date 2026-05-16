import { expect, test, type Page } from "@playwright/test";

const PROVIDER_NAME = "amx-microservices-provider";
const PROVIDER_TITLE = "amx microservices skills agents provider";
const PROVIDER_SKILLS = [
  "image-microservice-router",
  "video-microservice-router",
  "audio-microservice-router",
  "ondemand-webhook-intake",
] as const;

async function getFirstCompany(page: Page) {
  const res = await page.request.get("/api/companies");
  expect(res.ok()).toBe(true);
  const companies = (await res.json()) as Array<{ id: string; issuePrefix: string }>;
  expect(companies.length).toBeGreaterThan(0);
  return companies[0]!;
}

async function verifyBookingSurface(page: Page, companyPrefix: string, path: "xp/exchange" | "marketplace") {
  await page.goto(`/${companyPrefix}/${path}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: /AMX Skills Marketplace/i }).first()).toBeVisible();
  await expect
    .poll(async () => (await page.locator("body").innerText()).toLowerCase())
    .toMatch(new RegExp(`${PROVIDER_NAME}|${PROVIDER_TITLE}`));

  for (const skill of PROVIDER_SKILLS) {
    await expect.poll(async () => (await page.locator("body").innerText()).toLowerCase()).toContain(skill);
  }

  await expect.poll(async () => await page.locator("body").innerText()).toContain("100 AMX");
  await expect.poll(async () => (await page.locator("body").innerText()).toLowerCase()).toMatch(/content-production|pit-stop|simulation/);

  const bookingButton = page.getByRole("button", { name: /Book Microservice/i }).first();
  await expect(bookingButton).toBeVisible();
  await bookingButton.click();

  await expect(page.getByText("Microservice Booking")).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveValue("1");
  await expect(page.getByLabel("Task type")).toHaveValue("image_generate");
  await expect(page.getByLabel("Title")).toHaveValue(new RegExp("request$"));

  const submitButton = page.getByRole("button", { name: /Book \+ Create Issue/i });
  await expect(submitButton).toBeDisabled();

  await page.getByLabel("Instructions").fill("Preview only for e2e validation.");
  await expect(submitButton).toBeEnabled();

  await page.locator("div.fixed.inset-0").getByRole("button").first().click();
  await expect(page.getByText("Microservice Booking")).not.toBeVisible();
}

test.describe("Marketplace microservice booking surfaces", () => {
  test("xp exchange renders provider metadata and modal defaults", async ({ page }) => {
    const company = await getFirstCompany(page);
    await verifyBookingSurface(page, company.issuePrefix, "xp/exchange");
  });

  test("marketplace hire view renders provider metadata and modal defaults", async ({ page }) => {
    const company = await getFirstCompany(page);
    await verifyBookingSurface(page, company.issuePrefix, "marketplace");
  });

  test("booking creates an issue with a microservice work order panel", async ({ page }) => {
    const company = await getFirstCompany(page);
    await page.goto(`/${company.issuePrefix}/xp/exchange`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Book Microservice/i }).first().click();
    await page.getByLabel("Client name").fill("Mario Duerson");
    await page.getByLabel("Client email").fill("marioduerson1cte@gmail.com");
    await page.getByLabel("Client company").fill("AMX Electives");
    await page.getByLabel("Instructions").fill("End-to-end booking verification for the microservice work order.");
    await page.getByRole("button", { name: /Book \+ Create Issue/i }).click();

    await expect(page.getByText(/Microservice work booked/i)).toBeVisible();
    await page.getByRole("button", { name: /View Issue/i }).click();

    await expect(page.getByText("Microservice Work Order")).toBeVisible();
    await expect(page.getByLabel("Client email")).toHaveValue("marioduerson1cte@gmail.com");
    await expect(page.getByLabel("Current stage")).toHaveValue("pre_production");
    await expect(page.getByText("Client Update Email")).toBeVisible();
  });
});

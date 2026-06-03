import { test, expect } from "@playwright/test";

test("User can sign up via cloud UI", async ({ page }) => {
  // Go to /auth page
  await page.goto("/auth");

  // Verify the page heading/branding
  await expect(page.locator("h1")).toHaveText(/Sign in to AMX LABS/i);

  // Click on "Create one" to switch to sign up mode
  await page.getByRole("button", { name: "Create one" }).click();

  // Verify header change
  await expect(page.locator("h1")).toHaveText(/Create your AMX account/i);

  // Generate unique test email
  const uniqueEmail = `test-user-${Date.now()}@amx-air-hubs.cc`;
  const name = "Cloud UI Test User";
  const password = "SecurePassword123!";

  // Fill in the form
  await page.locator("#name").fill(name);
  await page.locator("#email").fill(uniqueEmail);
  await page.locator("#password").fill(password);

  // Submit the form
  await page.getByRole("button", { name: "Create Account" }).click();

  // Wait for signup and onboarding page to load
  // If signup is successful, it should redirect to the onboarding page or dashboard.
  // Let's print out the current URL after navigation or timeout.
  console.log("Form submitted. Waiting for page navigation...");
  
  // Since new signup redirect will depend on whether they have a company or need onboarding,
  // we check if they land on the onboarding page, dashboard, or if a company setup is prompt.
  // Usually it lands on onboarding: /onboarding or /
  await page.waitForURL((url) => {
    return url.pathname === "/" || url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding") || url.pathname.includes("/wizard");
  }, { timeout: 30000 });

  console.log("Successfully navigated to:", page.url());

  // Confirm that we are logged in by checking page does not have auth anymore
  expect(page.url()).not.toContain("/auth");
});

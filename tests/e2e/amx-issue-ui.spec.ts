import { test, expect } from "@playwright/test";

test("AMX-LABS Create Issue E2E", async ({ page }) => {
  // 1. Navigate to the local instance (using the company prefix directly)
  await page.goto("http://localhost:3100/AMXA/issues");
  
  // 2. Wait for the page to load (check for Issues header or New Issue button)
  const newIssueBtn = page.getByRole("button", { name: /New Issue|Create Issue/i }).first();
  await expect(newIssueBtn).toBeVisible({ timeout: 15_000 });

  // 3. Click New Issue
  await newIssueBtn.click();

  // 4. Wait for the dialog to appear
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // 5. Fill out the form
  // Find the title input (usually the first textarea or input)
  const titleInput = dialog.locator("textarea, input").first();
  await expect(titleInput).toBeVisible();
  
  const issueTitle = `E2E Test Issue ${Date.now()}`;
  await titleInput.fill(issueTitle);

  // 5.5 Assign to an agent
  // Look for the assignee combobox, typically defaults to 'Unassigned'
  const assigneeCombobox = dialog.getByRole("combobox").filter({ hasText: /Unassigned|Assignee/i }).first();
  if (await assigneeCombobox.isVisible()) {
    await assigneeCombobox.click();
    // Wait for the popover content
    const assigneeOption = page.getByRole("option", { name: /Zomorphesus|CEO/i }).first();
    await expect(assigneeOption).toBeVisible({ timeout: 5000 });
    await assigneeOption.click();
  } else {
    // Maybe it's not a combobox, just try clicking something with "Unassigned"
    const unassignedBtn = dialog.getByText("Unassigned");
    if (await unassignedBtn.isVisible()) {
        await unassignedBtn.click();
        const ceoOption = page.getByText(/Zomorphesus|CEO/i).first();
        await expect(ceoOption).toBeVisible({ timeout: 5000 });
        await ceoOption.click();
    }
  }

  
  // 6. Click Create (button could be "Create Issue", "Create", "Create & Open Issue")
  const createBtn = dialog.getByRole("button", { name: /Create/i }).last();
  await expect(createBtn).toBeEnabled();
  await createBtn.click();

  // 7. Wait for the dialog to close
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // 8. Verify the issue is in the list
  const issueLink = page.getByText(issueTitle);
  await expect(issueLink).toBeVisible({ timeout: 15_000 });
});

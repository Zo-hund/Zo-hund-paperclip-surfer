import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Onboarding wizard flow (skip_llm mode).
 *
 * Walks through the 4-step OnboardingWizard:
 *   Step 1 — Name your company
 *   Step 2 — Create your first agent (adapter selection + config)
 *   Step 3 — Give it something to do (task creation)
 *   Step 4 — Ready to launch (summary + open issue)
 *
 * By default this runs in skip_llm mode: we do NOT assert that an LLM
 * heartbeat fires. Set PAPERCLIP_E2E_SKIP_LLM=false to enable LLM-dependent
 * assertions (requires a valid ANTHROPIC_API_KEY).
 */

const SKIP_LLM = process.env.PAPERCLIP_E2E_SKIP_LLM !== "false";

const COMPANY_NAME = `E2E-Test-${Date.now()}`;
const AGENT_NAME = "CEO";
const TASK_TITLE = "E2E test task";
const MICROSERVICE_SKILLS = [
  "paperclipai/paperclip/firecrawl",
  "paperclipai/paperclip/page-agent",
  "image-microservice-router",
  "video-microservice-router",
  "audio-microservice-router",
  "ondemand-webhook-intake",
] as const;

test.describe.configure({ timeout: 120_000 });

async function mockLocalAdapterReadiness(
  page: Page,
  options?: {
    opencodeModel?: string;
    opencodeStatus?: "pass" | "warn" | "fail";
    codexStatus?: "pass" | "warn" | "fail";
    geminiStatus?: "pass" | "warn" | "fail";
    claudeStatus?: "pass" | "warn" | "fail";
  },
) {
  const opencodeModel = options?.opencodeModel ?? "anthropic/claude-3-5-haiku-latest";
  const opencodeStatus = options?.opencodeStatus ?? "pass";
  const codexStatus = options?.codexStatus ?? "pass";
  const geminiStatus = options?.geminiStatus ?? "pass";
  const claudeStatus = options?.claudeStatus ?? "fail";

  await page.route("**/api/companies/*/adapters/opencode_local/detect-model", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: opencodeModel,
        provider: opencodeModel.split("/")[0],
        source: "playwright-mock",
      }),
    });
  });

  await page.route("**/api/companies/*/adapters/opencode_local/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: opencodeModel,
          label: opencodeModel,
        },
      ]),
    });
  });

  await page.route("**/api/companies/*/adapters/*/test-environment", async (route) => {
    const adapterType = route.request().url().split("/adapters/")[1]?.split("/")[0] ?? "";
    const statusByAdapter: Record<string, "pass" | "warn" | "fail"> = {
      opencode_local: opencodeStatus,
      codex_local: codexStatus,
      gemini_local: geminiStatus,
      claude_local: claudeStatus,
    };
    const status = statusByAdapter[adapterType] ?? "pass";
    const body =
      status === "fail"
        ? {
            status,
            checks: [
              {
                code: `${adapterType}_missing_cli`,
                status: "fail",
                message: `${adapterType} is not configured in this test environment.`,
              },
            ],
          }
        : {
            status,
            checks: [
              {
                code: `${adapterType}_ready`,
                status,
                message: `${adapterType} responded to the readiness probe.`,
              },
            ],
          };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function openWizard(page: Page) {
  await page.goto("/");

  const wizardHeading = page.locator("h3", { hasText: "Name your company" });
  const newCompanyBtn = page.getByRole("button", { name: /New Company|Add company/i });

  await expect(wizardHeading.or(newCompanyBtn)).toBeVisible({ timeout: 15_000 });

  if (await newCompanyBtn.isVisible()) {
    await newCompanyBtn.click();
  }

  await expect(wizardHeading).toBeVisible({ timeout: 5_000 });
}

async function createCompanyAndReachAgentStep(page: Page, companyName: string) {
  await openWizard(page);
  await page.locator('input[placeholder="Acme Corp"]').fill(companyName);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("h3", { hasText: "Create your first agent" })).toBeVisible({ timeout: 20_000 });
}

async function finishWizardAndLoadCompany(page: Page, companyName: string) {
  await page.getByRole("button", { name: "Create & Open Issue" }).click();
  await expect(page).toHaveURL(/\/[A-Z0-9]+\/dashboard$/, { timeout: 15_000 });

  const baseUrl = page.url().split("/").slice(0, 3).join("/");
  const companiesRes = await page.request.get(`${baseUrl}/api/companies`);
  expect(companiesRes.ok()).toBe(true);

  const companies = await companiesRes.json();
  const company = companies.find((c: { name: string }) => c.name === companyName);
  expect(company).toBeTruthy();

  return { baseUrl, company };
}

test.describe("Onboarding wizard", () => {
  test("completes full wizard flow", async ({ page }) => {
    await mockLocalAdapterReadiness(page);
    await createCompanyAndReachAgentStep(page, COMPANY_NAME);

    const agentNameInput = page.locator('input[placeholder="CEO"]');
    await expect(agentNameInput).toHaveValue(AGENT_NAME);

    await expect(page.getByText(/Recommended adapter: OpenCode/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "More Agent Adapter Types" }).click();
    await expect(page.getByRole("button", { name: "Process" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 15_000 });

    await page.getByRole("button", { name: "Next" }).click();

    await expect(
      page.locator("h3", { hasText: "Give it something to do" })
    ).toBeVisible({ timeout: 45_000 });

    const taskTitleInput = page.locator(
      'input[placeholder="e.g. Research competitor pricing"]'
    );
    await taskTitleInput.clear();
    await taskTitleInput.fill(TASK_TITLE);

    await page.getByRole("button", { name: "Next" }).click();

    await expect(
      page.locator("h3", { hasText: "Ready to launch" })
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("text=" + COMPANY_NAME)).toBeVisible();
    await expect(page.locator("text=" + TASK_TITLE)).toBeVisible();

    const { baseUrl, company } = await finishWizardAndLoadCompany(page, COMPANY_NAME);

    const agentsRes = await page.request.get(
      `${baseUrl}/api/companies/${company.id}/agents`
    );
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    const ceoAgent = agents.find(
      (a: { name: string }) => a.name === AGENT_NAME
    );
    expect(ceoAgent).toBeTruthy();
    expect(ceoAgent.role).toBe("ceo");
    expect(ceoAgent.adapterType).not.toBe("process");

    const instructionsBundleRes = await page.request.get(
      `${baseUrl}/api/agents/${ceoAgent.id}/instructions-bundle?companyId=${company.id}`
    );
    expect(instructionsBundleRes.ok()).toBe(true);
    const instructionsBundle = await instructionsBundleRes.json();
    expect(
      instructionsBundle.files.map((file: { path: string }) => file.path).sort()
    ).toEqual(["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"]);

    const desiredSkills = (
      (ceoAgent.adapterConfig?.paperclipSkillSync?.desiredSkills as string[] | undefined) ?? []
    );
    for (const expectedSkill of MICROSERVICE_SKILLS) {
      if (expectedSkill.startsWith("paperclipai/")) {
        expect(desiredSkills).toContain(expectedSkill);
      } else {
        expect(
          desiredSkills.some((skill) => skill.endsWith(`/${expectedSkill}`)),
        ).toBe(true);
      }
    }

    let task: { id: string; assigneeAgentId: string; description: string } | undefined;
    await expect(async () => {
      const issuesRes = await page.request.get(
        `${baseUrl}/api/companies/${company.id}/issues`
      );
      expect(issuesRes.ok()).toBe(true);

      const issues = await issuesRes.json();
      task = issues.find(
        (i: { title: string }) => i.title === TASK_TITLE
      );
      expect(task).toBeTruthy();
    }).toPass({ timeout: 15_000, intervals: [1_000, 2_000, 5_000] });

    expect(task.assigneeAgentId).toBe(ceoAgent.id);
    expect(task.description).toContain(
      "You are the CEO. You set the direction for the company."
    );
    expect(task.description).not.toContain("github.com/paperclipai/companies");

    if (!SKIP_LLM) {
      await expect(async () => {
        const res = await page.request.get(
          `${baseUrl}/api/issues/${task.id}`
        );
        const issue = await res.json();
        expect(["in_progress", "done"]).toContain(issue.status);
      }).toPass({ timeout: 120_000, intervals: [5_000] });
    }
  });

  test("can disable microservice tooling during onboarding", async ({ page }) => {
    await mockLocalAdapterReadiness(page);
    const companyName = `E2E-No-Micro-${Date.now()}`;
    await createCompanyAndReachAgentStep(page, companyName);

    const toggle = page.getByRole("checkbox", { name: /Enable AMX microservices tooling/i });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("h3", { hasText: "Give it something to do" })).toBeVisible({ timeout: 45_000 });

    await page.locator('input[placeholder="e.g. Research competitor pricing"]').fill("No microservice tooling");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("h3", { hasText: "Ready to launch" })).toBeVisible({ timeout: 10_000 });
    const { baseUrl, company } = await finishWizardAndLoadCompany(page, companyName);

    const agentsRes = await page.request.get(`${baseUrl}/api/companies/${company.id}/agents`);
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    const ceoAgent = agents.find((a: { name: string }) => a.name === AGENT_NAME);
    expect(ceoAgent).toBeTruthy();

    const desiredSkills = (
      (ceoAgent.adapterConfig?.paperclipSkillSync?.desiredSkills as string[] | undefined) ?? []
    );
    for (const expectedSkill of MICROSERVICE_SKILLS) {
      if (expectedSkill.startsWith("paperclipai/")) {
        expect(desiredSkills).not.toContain(expectedSkill);
      } else {
        expect(
          desiredSkills.some((skill) => skill.endsWith(`/${expectedSkill}`)),
        ).toBe(false);
      }
    }
  });

  test("blocks manual Claude selection when the local CLI is unavailable and offers a runnable fallback", async ({ page }) => {
    await mockLocalAdapterReadiness(page, {
      opencodeStatus: "pass",
      claudeStatus: "fail",
    });
    const companyName = `E2E-Claude-Blocked-${Date.now()}`;
    await createCompanyAndReachAgentStep(page, companyName);

    await page.getByRole("button", { name: "More Agent Adapter Types" }).click();
    await page.getByRole("button", { name: "Claude Code" }).click();
    await page.getByRole("button", { name: "Test now" }).click();

    const switchButton = page.locator("button").filter({ hasText: /^Switch to /i }).first();
    await expect(switchButton).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    await switchButton.click({ force: true });

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("h3", { hasText: "Give it something to do" })).toBeVisible({ timeout: 45_000 });
  });
});

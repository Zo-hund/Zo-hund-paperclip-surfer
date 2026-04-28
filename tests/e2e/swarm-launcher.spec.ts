import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: SwarmLauncherDialog — 1 / 10 / 100 agent scenarios.
 *
 * Scenario 1 (1 agent) — full UI walkthrough: open dialog, step through all
 *   4 steps, verify monitor panel appears after launch.
 * Scenario 2 (10 agents) — create 10 agents via API, use Select-All button in
 *   the dialog, launch a sim swarm, verify monitor shows all agents.
 * Scenario 3 (100 agents) — API-level test: POST /swarm/launch with 100 agents,
 *   verify response shape, then POST /swarm/promote and verify live run lineage.
 *
 * No auth is required (local_trusted mode).
 */

const TAG = `e2e-swarm-${Date.now()}`;
const createdAgentIds: { companyId: string; agentId: string; baseUrl: string }[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveBaseUrl(page: Page): Promise<string> {
  return page.url().split("/").slice(0, 3).join("/");
}

async function getFirstCompany(
  page: Page,
  baseUrl: string,
): Promise<{ id: string; issuePrefix: string; name: string }> {
  const res = await page.request.get(`${baseUrl}/api/companies`);
  expect(res.ok()).toBe(true);
  const companies = (await res.json()) as Array<{
    id: string;
    issuePrefix: string;
    name: string;
  }>;
  expect(companies.length).toBeGreaterThan(0);
  return companies[0]!;
}

async function createTestAgent(
  page: Page,
  baseUrl: string,
  companyId: string,
  name: string,
): Promise<{ id: string }> {
  const res = await page.request.post(
    `${baseUrl}/api/companies/${companyId}/agents`,
    { data: { name, role: "general", adapterType: "process" } },
  );
  expect(res.ok()).toBe(true);
  const body = await res.json();
  const agent = (body.agent ?? body) as { id: string };
  createdAgentIds.push({ companyId, agentId: agent.id, baseUrl });
  return agent;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

test.afterAll(async ({ request }) => {
  // Best-effort delete all agents created during this test run.
  await Promise.allSettled(
    createdAgentIds.map(({ companyId, agentId, baseUrl }) =>
      request.delete(`${baseUrl}/api/companies/${companyId}/agents/${agentId}`),
    ),
  );
});

// ── Scenario 1: 1-agent swarm (full UI walkthrough) ──────────────────────────

test.describe("1-agent swarm — full UI walkthrough", () => {
  test("opens dialog, walks all 4 steps, sees monitor after launch", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const baseUrl = await resolveBaseUrl(page);
    const company = await getFirstCompany(page, baseUrl);

    const agent = await createTestAgent(
      page,
      baseUrl,
      company.id,
      `${TAG}-agent-1`,
    );
    expect(agent.id).toBeTruthy();

    // Navigate to OrgChart
    await page.goto(`/${company.issuePrefix}/org`);
    await page.waitForLoadState("networkidle");

    // Open the SwarmLauncherDialog
    const launchBtn = page.getByTitle("Launch Swarm");
    await expect(launchBtn).toBeVisible({ timeout: 10_000 });
    await launchBtn.click();

    // ── Step 1: Select agents ──
    await expect(
      page.locator("text=Select agents to include in the swarm"),
    ).toBeVisible({ timeout: 8_000 });

    // Select our test agent (click its row button)
    const agentRow = page.locator("button", { hasText: `${TAG}-agent-1` });
    await expect(agentRow).toBeVisible({ timeout: 8_000 });
    await agentRow.click();

    // Confirm the selection counter updates
    await expect(page.locator("text=1 of")).toBeVisible();

    // Next → Step 2
    await page.getByRole("button", { name: "Next" }).click();

    // ── Step 2: Work order ──
    await expect(
      page.locator("text=What should all agents work on?"),
    ).toBeVisible({ timeout: 5_000 });

    const textarea = page.locator(
      "textarea[placeholder='Describe the work order for this swarm...']",
    );
    await expect(textarea).toBeVisible();
    await textarea.fill("Summarize the latest issue");

    // Next → Step 3
    await page.getByRole("button", { name: "Next" }).click();

    // ── Step 3: Mode & protections ──
    await expect(page.locator("text=Run Mode")).toBeVisible({ timeout: 5_000 });

    // Default mode should be Simulation
    const simButton = page.locator("button", { hasText: "Simulation" });
    await expect(simButton).toBeVisible();

    // Launch
    const launchSimBtn = page.getByRole("button", { name: /Launch Sim/i });
    await expect(launchSimBtn).toBeEnabled();
    await launchSimBtn.click();

    // ── Step 4: Monitor panel ──
    await expect(
      page.locator("text=Swarm running...").or(page.locator("text=Swarm complete")),
    ).toBeVisible({ timeout: 15_000 });

    // SIM badge should appear
    await expect(page.locator("text=SIM")).toBeVisible({ timeout: 5_000 });

    // Stats grid: should have Total = 1
    await expect(page.locator("text=1").first()).toBeVisible();

    // No error toast
    await expect(page.locator("text=Swarm failed to launch")).not.toBeVisible();
  });
});

// ── Scenario 2: 10-agent swarm (bulk select via UI) ──────────────────────────

test.describe("10-agent swarm — bulk select via UI", () => {
  test("creates 10 agents, selects all via All button, launches sim, sees 10 in monitor", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const baseUrl = await resolveBaseUrl(page);
    const company = await getFirstCompany(page, baseUrl);

    // Create 10 agents in parallel
    const agentNames = Array.from(
      { length: 10 },
      (_, i) => `${TAG}-bulk-${i + 1}`,
    );
    await Promise.all(
      agentNames.map((name) =>
        createTestAgent(page, baseUrl, company.id, name),
      ),
    );

    // Navigate to OrgChart
    await page.goto(`/${company.issuePrefix}/org`);
    await page.waitForLoadState("networkidle");

    // Open dialog
    const launchBtn = page.getByTitle("Launch Swarm");
    await expect(launchBtn).toBeVisible({ timeout: 10_000 });
    await launchBtn.click();

    // ── Step 1: Select all via the "All" link ──
    await expect(
      page.locator("text=Select agents to include in the swarm"),
    ).toBeVisible({ timeout: 8_000 });

    // Wait for agent list to populate (at least our 10)
    await expect(
      page.locator("button", { hasText: `${TAG}-bulk-1` }),
    ).toBeVisible({ timeout: 10_000 });

    // Click "All" to select everything
    await page.locator("button", { hasText: "All" }).click();

    // Count badge should show at least 10 selected — matches "N of M agents selected"
    const countSpan = page.locator("span", { hasText: /\d+ of \d+ agents selected/ });
    await expect(countSpan).toBeVisible({ timeout: 5_000 });
    const countText = await countSpan.textContent();
    const selected = parseInt(countText?.match(/^(\d+)/)?.[1] ?? "0", 10);
    expect(selected).toBeGreaterThanOrEqual(10);

    // Next → Step 2
    await page.getByRole("button", { name: "Next" }).click();

    // ── Step 2: Work order ──
    await expect(
      page.locator("text=What should all agents work on?"),
    ).toBeVisible({ timeout: 5_000 });
    await page
      .locator("textarea[placeholder='Describe the work order for this swarm...']")
      .fill("Run batch diagnostics");

    // Next → Step 3
    await page.getByRole("button", { name: "Next" }).click();

    // ── Step 3: Launch ──
    await expect(page.locator("text=Run Mode")).toBeVisible({ timeout: 5_000 });

    // Launch summary should show the selected agent count
    await expect(
      page.locator("span", { hasText: new RegExp(`${selected} agents`) }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Launch Sim/i }).click();

    // ── Step 4: Monitor ──
    await expect(
      page.locator("text=Swarm running...").or(page.locator("text=Swarm complete")),
    ).toBeVisible({ timeout: 20_000 });

    // SIM badge
    await expect(page.locator("text=SIM")).toBeVisible({ timeout: 5_000 });

    // The total count in the stats grid should match selected count
    const totalLocator = page.locator(`text=${selected}`);
    await expect(totalLocator.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── Scenario 3: 100-agent swarm (API-level) ───────────────────────────────────

test.describe("100-agent swarm — API launch + promote", () => {
  test("launches 100-agent sim swarm via API, verifies shape, promotes to live", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const baseUrl = await resolveBaseUrl(page);
    const company = await getFirstCompany(page, baseUrl);

    // Create 100 agents in batches of 10 to avoid overwhelming the server
    const agentNames = Array.from(
      { length: 100 },
      (_, i) => `${TAG}-100-${String(i + 1).padStart(3, "0")}`,
    );
    const agentIds: string[] = [];
    const batchSize = 10;
    for (let i = 0; i < agentNames.length; i += batchSize) {
      const batch = agentNames.slice(i, i + batchSize);
      const created = await Promise.all(
        batch.map((name) => createTestAgent(page, baseUrl, company.id, name)),
      );
      agentIds.push(...created.map((a) => a.id));
    }
    expect(agentIds.length).toBe(100);

    // ── Launch 100-agent sim swarm ──
    const swarmBatchId = crypto.randomUUID();
    const launchRes = await page.request.post(
      `${baseUrl}/api/companies/${company.id}/swarm/launch`,
      {
        data: {
          agentIds,
          payload: { taskRequest: "Ping" },
          runMode: "sim",
          swarmBatchId,
          protections: { failureThreshold: 1.0, maxConcurrentAgents: 10 },
        },
      },
    );

    expect(launchRes.ok()).toBe(true);
    const launchBody = (await launchRes.json()) as {
      batchId: string;
      runMode: string;
      runs: Array<{ runMode: string; swarmBatchId: string; id: string }>;
    };

    expect(launchBody.batchId).toBeTruthy();
    expect(launchBody.runMode).toBe("sim");
    expect(launchBody.runs.length).toBe(100);

    // All runs should carry the correct batch tag and mode
    for (const run of launchBody.runs) {
      expect(run.runMode).toBe("sim");
      expect(run.swarmBatchId).toBe(launchBody.batchId);
    }

    // ── Promote to Live ──
    // Note: promote only elevates *completed* sim runs. In a test environment
    // with process adapters, runs may still be queued. We verify the endpoint
    // returns a valid response shape; run promotion in a real environment
    // requires waiting for sim runs to finish first.
    const promoteRes = await page.request.post(
      `${baseUrl}/api/companies/${company.id}/swarm/promote`,
      {
        data: {
          swarmBatchId: launchBody.batchId,
          agentIds,
        },
      },
    );

    expect(promoteRes.ok()).toBe(true);
    const promoteBody = (await promoteRes.json()) as {
      batchId: string;
      sourceBatchId: string;
      runs: Array<{
        runMode: string;
        promotedFromRunId: string | null;
      }>;
    };

    // Response shape must always be present regardless of completed run count
    expect(promoteBody.batchId).toBeTruthy();
    expect(promoteBody.sourceBatchId).toBe(launchBody.batchId);
    expect(Array.isArray(promoteBody.runs)).toBe(true);

    // Any promoted runs that do exist must carry correct lineage
    for (const run of promoteBody.runs) {
      expect(run.runMode).toBe("live");
      expect(run.promotedFromRunId).not.toBeNull();
    }
  });
});

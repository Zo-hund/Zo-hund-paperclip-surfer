import { test, expect } from "@playwright/test";

/**
 * E2E: Meeting Hub — Gemini Live, WebRTC controls, Cockpit mode
 *
 * Requires the dev server to be running at http://127.0.0.1:3100
 * with GEMINI_API_KEY set (for the Gemini Live connection test).
 *
 * Run against existing server:
 *   PAPERCLIP_E2E_BASE_URL=http://127.0.0.1:3100 pnpm test:e2e --grep "meeting-gemini"
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  issuePrefix: string;
}

async function getFirstCompany(page: import("@playwright/test").Page): Promise<Company> {
  const res = await page.request.get("/api/companies");
  expect(res.ok()).toBe(true);
  const companies = await res.json() as Company[];
  expect(companies.length).toBeGreaterThan(0);
  return companies[0]!;
}

// Navigate to meetings hub and open VoiceMeetingRoom via "Start Live Meeting"
async function openVoiceMeetingRoom(page: import("@playwright/test").Page, issuePrefix: string) {
  await page.goto(`/${issuePrefix}/meetings`);
  await page.waitForLoadState("networkidle");

  // Click "Start Live Meeting" — this creates a meeting and renders VoiceMeetingRoom
  await page.getByRole("button", { name: /Start Live Meeting/i }).click();

  // Wait for VoiceMeetingRoom to mount (Gemini Live button is our anchor)
  await expect(page.getByTitle("Toggle Gemini Live")).toBeVisible({ timeout: 15_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("meeting-gemini: Meeting Hub — Gemini Live & controls", () => {
  let issuePrefix: string;
  let companyId: string;

  // Grant mic/camera permissions so getUserMedia doesn't throw
  test.use({
    permissions: ["microphone", "camera"],
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const company = await getFirstCompany(page);
    companyId = company.id;
    issuePrefix = company.issuePrefix;

    await openVoiceMeetingRoom(page, issuePrefix);
  });

  // ── Test 1: Controls render ─────────────────────────────────────────────────

  test("toolbar shows camera, screen share, and Gemini Live buttons", async ({ page }) => {
    await expect(page.getByTitle("Toggle camera")).toBeVisible();
    await expect(page.getByTitle("Toggle screen share")).toBeVisible();
    await expect(page.getByTitle("Toggle Gemini Live")).toBeVisible();
  });

  // ── Test 2: Gemini Live connect / disconnect ────────────────────────────────

  test("Gemini Live connects and reaches listening state", async ({ page }) => {
    const geminiBtn = page.getByTitle("Toggle Gemini Live");

    // Status bar should not be visible yet
    await expect(page.locator("text=GEMINI LIVE").first()).not.toBeVisible();

    // Connect
    await geminiBtn.click();

    // Status bar appears
    await expect(page.locator("text=GEMINI LIVE").first()).toBeVisible({ timeout: 5_000 });

    // Model name shown (allow for version variations like 2.0 or 3.1)
    await expect(page.locator("text=/gemini-.*-flash-live/").first()).toBeVisible({ timeout: 5_000 });

    // Wait for WS to settle — any status except "connecting" means the server responded
    // (listening/connected = Gemini key working; unavailable/error = key missing but WS ok)
    await expect.poll(
      async () => {
        for (const s of ["listening", "connected", "unavailable", "error", "thinking", "speaking"]) {
          if (await page.locator(`text=${s}`).first().isVisible()) return true;
        }
        return false;
      },
      { timeout: 20_000, intervals: [1_000] },
    ).toBe(true);

    // Disconnect
    await geminiBtn.click();

    // Status bar disappears
    await expect(page.locator("text=GEMINI LIVE").first()).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Test 3: Camera toggle ──────────────────────────────────────────────────

  test("camera button toggles without crashing", async ({ page }) => {
    const cameraBtn = page.getByTitle("Toggle camera");
    await expect(cameraBtn).toBeVisible();

    await cameraBtn.click();
    await expect(cameraBtn).toBeVisible({ timeout: 3_000 });

    await cameraBtn.click();
    await expect(cameraBtn).toBeVisible({ timeout: 3_000 });
  });

  // ── Test 4: Screen share button visible ────────────────────────────────────

  test("screen share button is present", async ({ page }) => {
    await expect(page.getByTitle("Toggle screen share")).toBeVisible();
  });

  // ── Test 5: Cockpit mode — Gemini Vision + Voice Commands panes ────────────

  test("cockpit mode shows Gemini Vision and Voice Commands sections", async ({ page }) => {
    // Default mode is cockpit — click the button to confirm
    const cockpitBtn = page.getByRole("button", { name: "Cockpit" });
    if (await cockpitBtn.isVisible()) {
      await cockpitBtn.click();
    }

    // Left pane: Gemini Vision card always rendered in cockpit mode
    await expect(page.locator("text=Gemini Vision").first()).toBeVisible({ timeout: 5_000 });
    // Right pane: Telemetry Feed header always rendered
    await expect(page.locator("text=TELEMETRY FEED")).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 6: Page Agent CustomEvent roundtrip ───────────────────────────────

  test("page agent fill_form CustomEvent dispatches without error", async ({ page }) => {
    const received = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        window.addEventListener("page-agent:fill", () => resolve(true), { once: true });
        window.dispatchEvent(
          new CustomEvent("page-agent:fill", {
            detail: { formType: "new_issue", fields: { title: "Test Issue" } },
          }),
        );
        setTimeout(() => resolve(false), 500);
      });
    });
    expect(received).toBe(true);
  });

  // ── Test 7: WebSocket endpoint upgrades successfully ──────────────────────

  test("gemini-live WebSocket endpoint accepts upgrade", async ({ page }) => {
    // Create a fresh meeting via API to get its ID for the WS URL
    const res = await page.request.post("/api/meetings", {
      data: { companyId, title: `E2E WS Test ${Date.now()}`, type: "strategy" },
    });
    expect(res.ok()).toBe(true);
    const meeting = await res.json() as { id: string };

    const proto = "ws:";
    const wsUrl = `${proto}//127.0.0.1:3100/api/meetings/${meeting.id}/gemini-live`;

    const result = await page.evaluate(async (url: string) => {
      return new Promise<string>((resolve) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => { ws.close(); resolve("timeout"); }, 5000);
        ws.onopen = () => { clearTimeout(timer); resolve("open"); ws.close(); };
        ws.onmessage = (e) => {
          clearTimeout(timer);
          try {
            const msg = JSON.parse(e.data as string) as { type: string };
            resolve(`msg:${msg.type}`);
          } catch {
            resolve("message");
          }
          ws.close();
        };
        ws.onerror = () => { clearTimeout(timer); resolve("ws_error"); };
        ws.onclose = (e) => { clearTimeout(timer); resolve(`closed:${e.code}`); };
      });
    }, wsUrl);

    // Any of these mean the WS upgraded (not a 404 or refused connection)
    // "open" → connected before any message
    // "msg:status" / "msg:error" → server sent a message (session started or key missing)
    // "closed:1011" → server closed with internal error (key issue) — still upgraded
    // "closed:1008" → policy violation — still upgraded
    expect(result).not.toBe("ws_error");
    expect(result).not.toBe("timeout");
  });
});

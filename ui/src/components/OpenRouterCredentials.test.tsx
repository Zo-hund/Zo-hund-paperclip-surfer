// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterCredentials } from "./OpenRouterCredentials";

vi.mock("../hooks/useCompanyRole", () => ({ useCompanyRole: () => ({ hasRoleAtLeast: () => true }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { companyKeyConfigured: false, defaultSource: "none", hostToolsEnabled: false } }),
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));
vi.mock("../api/openrouter", () => ({ openRouterApi: { status: vi.fn(), save: vi.fn(), validate: vi.fn(), remove: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter tenant switch", () => {
  it("discards an unsaved company key when navigating to a different tenant", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<OpenRouterCredentials companyId="company-a" />); });
      const input = container.querySelector("input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "company-a-private-key");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
      await act(async () => { root.render(<OpenRouterCredentials companyId="company-b" />); });
      expect(container.querySelector("input")!.value).toBe("");
      expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

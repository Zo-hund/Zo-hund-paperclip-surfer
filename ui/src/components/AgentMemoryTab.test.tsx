// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateAgentMemorySchema } from "@paperclipai/shared";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn(), toast: vi.fn() }));
vi.mock("../api/agentMemories", () => ({ agentMemoriesApi: {
  list: mocks.list, update: mocks.update, create: mocks.create, delete: mocks.remove,
} }));
vi.mock("../api/projects", () => ({ projectsApi: { list: async () => [] } }));
vi.mock("../context/ToastContext", () => ({ useToastActions: () => ({ pushToast: mocks.toast }) }));
import { AgentMemoryTab } from "./AgentMemoryTab";

const fixture = { id: "memory-a", agentId: "agent-a", companyId: "company-a", scope: "global",
  projectId: null, category: "learning", title: "Retained memory", content: "Original memory",
  source: "human", confidence: 0.8, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
describe("AMX memory editor integration", () => {
  let root: Root, host: HTMLDivElement, client: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([fixture]);
    mocks.update.mockImplementation(async (_agentId, _id, data) => {
      updateAgentMemorySchema.parse(data);
      return { ...fixture, ...data };
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  });
  async function render(companyId = "company-a") {
    await act(async () => root.render(<QueryClientProvider client={client}>
      <AgentMemoryTab companyId={companyId} agentId="agent-a" />
    </QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  it("sends only mutable fields when editing a preserved memory", async () => {
    await render();
    await vi.waitFor(() => expect(host.textContent).toContain("Retained memory"));
    const edit = host.querySelector<HTMLButtonElement>('[aria-label="Edit memory"]')!;
    await act(async () => edit.click());
    const save = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "Update")!;
    await act(async () => save.click());
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledWith("agent-a", "memory-a", {
      title: "Retained memory", content: "Original memory", category: "learning", confidence: 0.8,
    }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ tone: "warn" }));
  });
  it("shows a failed read with retry rather than an empty memory list", async () => {
    mocks.list.mockRejectedValue(new Error("Access denied"));
    await render();
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull());
    expect(host.textContent).not.toContain("No memories yet");
    mocks.list.mockResolvedValue([fixture]);
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    await vi.waitFor(() => expect(host.textContent).toContain("Retained memory"));
  });
  it("separates cached memories by company as well as agent", async () => {
    await render();
    expect(client.getQueryData(["agentMemories", "company-a", "agent-a"])).toEqual([fixture]);
    mocks.list.mockResolvedValue([]);
    await render("company-b");
    expect(client.getQueryData(["agentMemories", "company-b", "agent-a"])).toEqual([]);
    expect(client.getQueryData(["agentMemories", "company-a", "agent-a"])).toEqual([fixture]);
  });
});

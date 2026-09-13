// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ publicProfiles: vi.fn(), privateProfiles: vi.fn(), userId: "owner-a", settled: true }));
vi.mock("../api/directory", () => ({ directoryApi: { getPublicProfiles: mocks.publicProfiles, getInstanceProfiles: mocks.privateProfiles } }));
vi.mock("../api/companies-query", () => ({ useAccountIdentity: () => ({ userId: mocks.userId, settled: mocks.settled }) }));
import { PublicProfileDirectory, InstanceProfileDirectory } from "./ProfileDirectory";

const profile = { id: "agent-a", type: "agent", name: "Directory agent", title: "Developer",
  companyId: "company-a", companyName: "Company A", companyPrefix: "AMA", skills: ["Docker"], href: "/AMA/agents/agent-a" };
describe("AMX profile directory UI", () => {
  let root: Root, host: HTMLDivElement, client: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks(); mocks.userId = "owner-a"; mocks.settled = true;
    mocks.publicProfiles.mockResolvedValue({ profiles: [profile], total: 100 });
    mocks.privateProfiles.mockResolvedValue({ profiles: [{ ...profile, name: "Private agent", isPublicProfile: false }], total: 1 });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });
  async function render(instance = false) {
    await act(async () => root.render(<QueryClientProvider client={client}>{instance ? <InstanceProfileDirectory /> : <PublicProfileDirectory />}</QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  function button(label: string) { return [...host.querySelectorAll("button")].find((node) => node.textContent === label)!; }

  it("loads public profiles without consulting the private transport and expands the bounded result", async () => {
    await render();
    expect(host.textContent).toContain("Directory agent");
    expect(mocks.privateProfiles).not.toHaveBeenCalled();
    expect(host.querySelectorAll("img")).toHaveLength(0);
    await act(async () => button("Load more").click());
    await vi.waitFor(() => expect(mocks.publicProfiles).toHaveBeenLastCalledWith({ limit: 100 }, expect.any(AbortSignal)));
  });
  it("applies skill filters only on submit and resets them explicitly", async () => {
    await render();
    const input = host.querySelector<HTMLInputElement>("#directory-skill")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Docker");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mocks.publicProfiles).toHaveBeenCalledTimes(1);
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await vi.waitFor(() => expect(mocks.publicProfiles).toHaveBeenLastCalledWith(expect.objectContaining({ skill: "Docker", limit: 50 }), expect.any(AbortSignal)));
    await act(async () => button("Clear filters").click());
    expect(input.value).toBe("");
  });
  it("shows a failed request with retry, not an empty result", async () => {
    mocks.publicProfiles.mockRejectedValue(new Error("offline")); await render();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("No profiles match");
    mocks.publicProfiles.mockResolvedValue({ profiles: [profile], total: 1 });
    await act(async () => button("Retry").click());
    await vi.waitFor(() => expect(host.textContent).toContain("Directory agent"));
  });
  it("hides private data on permission denial and never populates the public cache", async () => {
    await render(true); expect(host.textContent).toContain("Private agent");
    mocks.privateProfiles.mockRejectedValue(new ApiError("Forbidden", 403, null));
    await act(async () => { await client.invalidateQueries({ queryKey: ["directory", "instance-profiles"] }); });
    await vi.waitFor(() => expect(host.textContent).toContain("You do not have access"));
    expect(host.textContent).not.toContain("Private agent");
    expect(host.textContent).not.toContain("Company A");
    await render(); expect(host.textContent).toContain("Directory agent");
    expect(host.textContent).not.toContain("Private agent");
  });
  it("discards the previous account's private view while the new identity is unresolved", async () => {
    await render(true); expect(host.textContent).toContain("Private agent");
    mocks.userId = "owner-b"; mocks.settled = false;
    await render(true);
    expect(host.textContent).not.toContain("Private agent");
    expect(host.textContent).not.toContain("Company A");
    expect(mocks.privateProfiles).toHaveBeenCalledTimes(1);
  });
});

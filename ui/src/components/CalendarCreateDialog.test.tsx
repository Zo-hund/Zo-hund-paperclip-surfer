// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Calendar } from "../pages/Calendar";
import { localEventInstant } from "./CalendarCreateDialog";

const fixture = vi.hoisted(() => ({ company: "A", events: [] as Record<string, unknown>[], create: vi.fn(), read: vi.fn(), breadcrumb: vi.fn() }));
vi.mock("../api/calendar", () => ({ calendarApi: { createEvent: fixture.create, getCalendar: fixture.read } }));
vi.mock("../api/meetings", () => ({ meetingsApi: { list: async () => [] } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: async () => [] } }));
vi.mock("../api/amx", () => ({ amxApi: { getLms: async () => ({ workshops: [] }) } }));
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: fixture.company }) }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: fixture.breadcrumb }) }));
// Keep API/state behavior real; isolate surrounding dialog layout/focus from this regression suite.
vi.mock("./ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
function button(text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")].find(el => el.textContent?.trim() === text);
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}
function input(label: string): HTMLInputElement {
  const control = container.querySelector(`input[aria-label="${label}"]`);
  if (!(control instanceof HTMLInputElement)) throw new Error(`Missing input: ${label}`);
  return control;
}
function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function click(text: string) { act(() => button(text).click()); }
async function settle(check: () => void) {
  let failure: unknown;
  for (let attempt = 0; attempt < 200; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    try { check(); return; } catch (error) { failure = error; }
  }
  throw failure;
}
function draw() { act(() => root.render(<QueryClientProvider client={client}><Calendar /></QueryClientProvider>)); }
function fill() {
  click("New Event");
  change(input("Event title"), "Morning Sip fixture");
  change(input("Event start"), "2026-10-21T09:00");
  change(input("Event end"), "2026-10-21T09:15");
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.company = "A"; fixture.events = []; fixture.create.mockReset(); fixture.read.mockReset();
  fixture.create.mockImplementation(async (_id, body) => {
    fixture.events.push({ id: "saved-1", title: body.title, startAt: body.startDate, endAt: body.endDate, kind: "company_event", status: "draft", href: "" });
    return { id: "saved-1" };
  });
  fixture.read.mockImplementation(async () => ({ events: fixture.events.map(event => ({ ...event })) }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  draw();
});
afterEach(() => { act(() => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Calendar draft creation", () => {
  it("opens from New Event, creates a company draft and reads it back into the feed", async () => {
    fill(); expect(input("Event start").type).toBe("datetime-local"); click("Save draft event");
    await settle(() => expect(container.querySelector('[role="dialog"]')).toBeNull());
    await settle(() => expect(container.textContent).toContain("Morning Sip fixture"));
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.create).toHaveBeenCalledWith("A", expect.objectContaining({ startDate: "2026-10-21T13:00:00.000Z", isPublished: false }));
    expect(container.textContent).toContain("Calendar view times:");
    expect(container.querySelector("time")?.textContent).toBe(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date("2026-10-21T13:00:00.000Z")));
  });
  it("retains form values after an administrator rejection", async () => {
    fixture.create.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    fill(); click("Save draft event");
    await settle(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("do not have permission"));
    expect(input("Event title").value).toBe("Morning Sip fixture"); expect(fixture.events).toHaveLength(0);
  });
  it("rejects an end before start without sending a create", () => {
    fill(); change(input("Event end"), "2026-10-21T08:00"); click("Save draft event");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("End time"); expect(fixture.create).not.toHaveBeenCalled();
  });
  it("reconciles a saved ID without issuing another create", async () => {
    let fail = true;
    fixture.read.mockImplementation(async (_id, filters) => { if (filters && fixture.events.length && fail) throw new Error("Temporary read failure"); return { events: fixture.events.map(event => ({ ...event })) }; });
    fill(); click("Save draft event"); await settle(() => expect(button("Check saved event")).toBeDefined());
    fail = false; click("Check saved event"); await settle(() => expect(container.querySelector('[role="dialog"]')).toBeNull());
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
  it("blocks repeat submission after an uncertain create", async () => {
    fixture.create.mockRejectedValue(new Error("Network lost after request")); fill(); click("Save draft event");
    await settle(() => expect(button("Reconciliation required").disabled).toBe(true)); expect(fixture.create).toHaveBeenCalledTimes(1);
  });
  it("isolates pending creation across a company switch", async () => {
    let finish!: (value: { id: string }) => void;
    fixture.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fill(); click("Save draft event"); click("Saving / checking..."); expect(fixture.create).toHaveBeenCalledTimes(1);
    fixture.company = "B"; draw(); click("New Event"); expect(input("Event title").value).toBe("");
    await act(async () => finish({ id: "old-company-event" })); expect(input("Event title").value).toBe("");
  });
  it("rejects DST gaps and repeated Eastern times rather than silently shifting", () => {
    fill(); change(input("Event start"), "2026-03-08T02:30"); change(input("Event end"), "2026-03-08T03:30"); click("Save draft event");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("does not exist");
    change(input("Event start"), "2026-11-01T01:30"); change(input("Event end"), "2026-11-01T02:30"); click("Save draft event");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("occurs twice"); expect(fixture.create).not.toHaveBeenCalled();
  });
  it("converts winter/summer and explicit UTC deterministically", () => {
    expect(localEventInstant("2026-12-21T09:00", "America/New_York")).toBe("2026-12-21T14:00:00.000Z");
    expect(localEventInstant("2026-10-21T09:00", "America/New_York")).toBe("2026-10-21T13:00:00.000Z");
    expect(localEventInstant("2026-11-01T01:30", "UTC")).toBe("2026-11-01T01:30:00.000Z");
    expect(() => localEventInstant("2026-02-30T09:00", "UTC")).toThrow("valid calendar");
  });
});

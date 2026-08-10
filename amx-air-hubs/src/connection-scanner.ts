export type ConnectionKind = "member" | "partner" | "pass" | "proof" | "mission" | "room" | "amx" | "external";

export interface ConnectionTarget { kind: ConnectionKind; label: string; detail: string; href: string; trusted: boolean }

const trustedHosts = new Set(["amx-hubs.cc", "www.amx-hubs.cc", "amx-air-hubs-stage.zohund-ai.chatgpt.site"]);
const routes: Array<{ prefix: string; kind: ConnectionKind; label: string; detail: string }> = [
  { prefix: "/members/", kind: "member", label: "Member card", detail: "Open the member's public AMX identity." },
  { prefix: "/partner/", kind: "partner", label: "Partner campaign", detail: "Open an organization campaign or partner pathway." },
  { prefix: "/partners/join", kind: "partner", label: "Partner invitation", detail: "Review and claim an organization invitation." },
  { prefix: "/join/", kind: "pass", label: "Pod pass", detail: "Review this private Pod invitation." },
  { prefix: "/proof/", kind: "proof", label: "Verified proof", detail: "Inspect an AMX credential and its evidence." },
  { prefix: "/scan/", kind: "mission", label: "Mission access", detail: "Open the linked mission or learning experience." },
  { prefix: "/rooms/", kind: "room", label: "Live room", detail: "Enter the linked room lobby." },
  { prefix: "/watch/", kind: "room", label: "Live stage", detail: "Open the public event viewer." },
  { prefix: "/membership", kind: "amx", label: "Membership", detail: "Open AMX membership and access options." },
];

export function resolveConnectionPayload(value: string, currentOrigin: string): ConnectionTarget | null {
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw, currentOrigin); } catch { return null; }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
  const trusted = url.hostname === new URL(currentOrigin).hostname || trustedHosts.has(url.hostname);
  if (!trusted) return { kind: "external", label: "External connection", detail: "This link leaves AMX AIR HUBS. Review the destination before opening it.", href: url.href, trusted: false };
  const route = routes.find((candidate) => url.pathname === candidate.prefix || url.pathname.startsWith(candidate.prefix));
  return route ? { ...route, href: `${url.pathname}${url.search}${url.hash}`, trusted: true } : { kind: "amx", label: "AMX connection", detail: "Open this trusted AMX AIR HUBS destination.", href: `${url.pathname}${url.search}${url.hash}`, trusted: true };
}

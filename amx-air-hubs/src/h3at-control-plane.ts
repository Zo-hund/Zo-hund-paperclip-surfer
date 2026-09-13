export interface H3ATControlStatus {
  configured: boolean;
  connected: boolean;
  tenantId: string;
  allowedActions: string[];
  lastCommand: { action: string; target: string; status: string; timestamp: string } | null;
}

async function controlRequest(path = "", init?: RequestInit) {
  const response = await fetch(`/api/h3at/control-plane${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The H3AT control plane could not be reached.");
  return payload;
}

export async function loadH3ATControlStatus() {
  return controlRequest() as Promise<H3ATControlStatus>;
}

export async function sendH3ATControlCommand(input: { action: string; target: string; value?: string }) {
  return controlRequest("/commands", { method: "POST", body: JSON.stringify({ tenantId: "h3at-solutions", ...input }) }) as Promise<{ command: H3ATControlStatus["lastCommand"] }>;
}

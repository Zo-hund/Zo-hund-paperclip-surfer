/** Server-controlled grants; agent configuration cannot enable platform billing. */
export function isOpenRouterProvisioned(companyId: string): boolean {
  return (process.env.PAPERCLIP_OPENROUTER_COMPANY_IDS ?? "")
    .split(",").map((id) => id.trim()).filter(Boolean).includes(companyId);
}

/** Host tools execute inside the server's trust boundary, never implicitly for tenants. */
export function hasOpenRouterHostTools(companyId: string): boolean {
  return (process.env.PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS ?? "")
    .split(",").map((id) => id.trim()).filter(Boolean).includes(companyId);
}

export function resolveOpenRouterKey(companyId: string, config: Record<string, unknown>): string {
  const env = config.env;
  if (env && typeof env === "object" && Object.prototype.hasOwnProperty.call(env, "OPENROUTER_API_KEY")) {
    const value = (env as Record<string, unknown>).OPENROUTER_API_KEY;
    // An explicit empty/unresolved key must not fall through to someone else's billing.
    if (typeof value !== "string" || !value.trim() || value.includes("REDACTED")) {
      throw new Error("The selected OpenRouter key is empty or unresolved. Update the company key or agent secret reference.");
    }
    return value.trim();
  }
  if (!isOpenRouterProvisioned(companyId)) {
    throw new Error("Add an OpenRouter key in Company settings, or ask the operator to provision access for this company.");
  }
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key || key.includes("REDACTED")) {
    throw new Error("AMX-provisioned OpenRouter access has no usable server key. Contact the operator.");
  }
  return key;
}

export function openRouterErrorMessage(status: number): string {
  if (status === 401) return "OpenRouter rejected the selected API key (401). Check whether it is expired, disabled, or incorrect. No fallback key was used.";
  if (status === 402) return "The selected OpenRouter account has insufficient credits (402). No fallback key was used.";
  if (status === 403) return "OpenRouter denied access for the selected key (403). Check its permissions.";
  if (status === 429) return "OpenRouter is rate limiting requests (429). Try again later.";
  return `OpenRouter request failed (${status}). Try again or check the provider status.`;
}

/** Checks authentication without requesting model inference or returning key metadata. */
export async function validateOpenRouterKey(key: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    throw new Error("Unable to validate the OpenRouter key. Check connectivity and try again.");
  }
  if (!response.ok) throw new Error(openRouterErrorMessage(response.status));
  let payload: { data?: { disabled?: boolean; expires_at?: string | null } };
  try { payload = await response.json(); } catch {
    throw new Error("OpenRouter returned an invalid key validation response.");
  }
  if (!payload?.data || typeof payload.data !== "object") {
    throw new Error("OpenRouter returned an invalid key validation response.");
  }
  if (payload.data.disabled || (payload.data.expires_at && Date.parse(payload.data.expires_at) <= Date.now())) {
    throw new Error("The selected OpenRouter key is disabled or expired. Replace it before running agents.");
  }
}

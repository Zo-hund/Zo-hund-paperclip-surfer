import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openRouterApi } from "../api/openrouter";
import { useCompanyRole } from "../hooks/useCompanyRole";
import { Button } from "./ui/button";

export function OpenRouterCredentials({ companyId }: { companyId: string }) {
  // Navigation must discard a key typed for the previous company immediately.
  return <CompanyOpenRouterCredentials key={companyId} companyId={companyId} />;
}

function CompanyOpenRouterCredentials({ companyId }: { companyId: string }) {
  const { hasRoleAtLeast } = useCompanyRole(companyId);
  const canManage = hasRoleAtLeast("admin");
  const queryClient = useQueryClient();
  const queryKey = ["openrouter-credentials", companyId];
  const status = useQuery({ queryKey, queryFn: () => openRouterApi.status(companyId), enabled: canManage });
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function perform(action: "save" | "validate" | "remove") {
    setBusy(true); setMessage(""); setFailed(false);
    // Keep credential material out of query/mutation caches and clear the input immediately.
    const submitted = key;
    setKey("");
    try {
      if (action === "validate") {
        const result = await openRouterApi.validate(companyId);
        setMessage(result.message); setFailed(!result.valid);
      } else {
        const result = action === "save"
          ? await openRouterApi.save(companyId, submitted)
          : await openRouterApi.remove(companyId);
        queryClient.setQueryData(queryKey, result);
        await queryClient.invalidateQueries({ queryKey: ["secrets", companyId] });
        setMessage(action === "save" ? "Key validated and saved securely for this company." : "Company key removed.");
        setConfirmRemove(false);
      }
    } catch (err) { setFailed(true); setMessage(err instanceof Error ? err.message : "Unable to update OpenRouter access."); }
    finally { setBusy(false); }
  }

  if (!canManage) return null;
  return <section className="rounded-lg border border-border p-4 space-y-4" aria-label="OpenRouter access">
    <div>
      <h2 className="text-lg font-medium">OpenRouter access</h2>
      <p className="text-sm text-muted-foreground">Use your own OpenRouter account for this company's agents, or use access provisioned by AMX.</p>
    </div>
    {status.isPending && <p>Loading OpenRouter access…</p>}
    {status.error && <p role="alert">{status.error.message}</p>}
    {status.data && <>
      <p className="text-sm">Default billing: <strong>{status.data.defaultSource === "company" ? "Your OpenRouter account" : status.data.defaultSource === "platform" ? "AMX-provisioned account" : "No key configured"}</strong></p>
      {!status.data.hostToolsEnabled && <p className="text-sm text-muted-foreground">Model access is available once your key passes validation. Coding tasks that need files or commands require an isolated worker.</p>}
      <p className="text-sm text-muted-foreground">{status.data.provisionedKeyConfigured ? "AMX-provisioned access is available for this company." : status.data.provisionedAccess ? "AMX access is enabled, but the operator still needs to configure its key." : "Ask your AMX operator if you need provisioned access."} An agent-specific key takes priority. A rejected key stops the run without switching accounts.</p>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void perform("save"); }}>
        <label className="block text-sm font-medium" htmlFor={`openrouter-key-${companyId}`}>{status.data.companyKeyConfigured ? "Replace company API key" : "Company API key"}</label>
        <input id={`openrouter-key-${companyId}`} type="password" autoComplete="new-password" spellCheck={false}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          value={key} onChange={(event) => setKey(event.target.value)} disabled={busy} placeholder="Enter your OpenRouter API key" />
        <p className="text-xs text-muted-foreground">Validated with OpenRouter before saving, encrypted at rest, and never displayed again. Validation does not run a model.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !key.trim()}>Validate and save key</Button>
          <Button type="button" variant="outline" disabled={busy || status.data.defaultSource === "none"} onClick={() => void perform("validate")}>Test default key</Button>
          {status.data.companyKeyConfigured && <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove company key</Button>}
        </div>
      </form>
      {confirmRemove && <div className="text-sm space-y-2">
        <p>{status.data.provisionedKeyConfigured ? "Removing this key switches agents using the company default to AMX billing." : "Removing this key leaves agents using the company default without access."} Agents referencing this secret directly will need their configuration updated.</p>
        <Button variant="destructive" disabled={busy} onClick={() => void perform("remove")}>Confirm removal</Button>{" "}
        <Button variant="outline" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</Button>
      </div>}
    </>}
    {message && <p role={failed ? "alert" : "status"} className="text-sm">{message}</p>}
  </section>;
}

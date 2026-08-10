import { useEffect, useMemo, useState } from "react";
import { Activity, Banknote, Cable, Clock3, ExternalLink, KeyRound, Landmark, LockKeyhole, PlugZap, Plus, RefreshCw, RotateCcw, Save, Send, ShieldCheck, Unplug, X } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { getActiveTenant } from "../operations";
import { loadConnections, saveConnection, setConnectionStatus, type ConnectionKind, type PlatformConnection, type ConnectionHistory } from "../connection-platform";
import { configurePrintfulWebhook, loadMerchPayouts, loadPrintfulRuntimeStatus, openStripeConnectDashboard, releaseMerchPayout, reverseMerchPayout, startStripeConnectOnboarding, type MerchPayoutProfile, type MerchPayoutSummary, type PrintfulRuntimeStatus } from "../merch-platform";

const catalog: Array<{ provider: string; name: string; kind: ConnectionKind; detail: string }> = [
  { provider: "openai", name: "OpenAI Agents", kind: "api", detail: "Agent reasoning, vision, voice, and tool calls" },
  { provider: "livekit", name: "LiveKit", kind: "api", detail: "Realtime rooms, voice, video, and agents" },
  { provider: "decart", name: "Decart AI Video", kind: "api", detail: "Lucy 2.5 realtime transformed camera sources" },
  { provider: "printful", name: "Printful Merch", kind: "api", detail: "Product catalog, order fulfillment, shipping, and tracking" },
  { provider: "stripe", name: "Stripe Commerce", kind: "api", detail: "Hosted checkout, Express onboarding, and collective payouts" },
  { provider: "supabase", name: "Supabase", kind: "api", detail: "Identity, realtime state, proof, and RLS" },
  { provider: "mcp", name: "MCP Gateway", kind: "mcp", detail: "Governed remote tools and resources" },
  { provider: "streamlabs", name: "Streamlabs", kind: "webhook", detail: "Broadcast scenes, sources, and show control" },
  { provider: "google", name: "Google Workspace", kind: "oauth", detail: "Calendar, Drive, Maps, and event resources" },
  { provider: "skills", name: "AMX Skill Registry", kind: "skill", detail: "Tenant-approved agent capabilities" },
  { provider: "plugins", name: "Plugin Registry", kind: "plugin", detail: "Signed platform extensions" },
  { provider: "h3at-management", name: "H3AT Management API", kind: "api", detail: "Tenant-scoped projects, workforce records, Pod page control, and approved agent tools" },
];

function PrintfulDiagnostics({ status }: { status: PrintfulRuntimeStatus }) {
  const diagnostics = Object.entries(status.printful.diagnostics || {});
  if (!diagnostics.length && !status.printful.recommendedAction) return null;
  return <div className="printful-diagnostics">
    {diagnostics.map(([name, diagnostic]) => <StatusPill key={name} tone={diagnostic.ok ? "green" : "gold"}>
      {name.replace(/([A-Z])/g, " $1").toUpperCase()}: {diagnostic.ok ? "READY" : diagnostic.status || "OFFLINE"}
    </StatusPill>)}
    {status.printful.recommendedAction && <small>{status.printful.recommendedAction}</small>}
  </div>;
}

export function ConnectionsPage() {
  const tenantId = getActiveTenant();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [history, setHistory] = useState<ConnectionHistory[]>([]);
  const [selected, setSelected] = useState<(typeof catalog)[number] | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [secret, setSecret] = useState("");
  const [scopes, setScopes] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [printfulRuntime, setPrintfulRuntime] = useState<PrintfulRuntimeStatus | null>(null);
  const [payouts, setPayouts] = useState<MerchPayoutSummary | null>(null);
  const [beneficiaryType, setBeneficiaryType] = useState<MerchPayoutProfile["beneficiaryType"]>("partner");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [reverseTarget, setReverseTarget] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const refresh = async () => {
    setBusy(true);
    try { const result = await loadConnections(tenantId); setConnections(result.connections); setHistory(result.history); setNotice(""); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Connections could not be loaded."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, [tenantId]);
  const rows = useMemo(() => catalog.map((item) => ({ ...item, connection: connections.find((connection) => connection.provider === item.provider) })), [connections]);
  const configure = (item: (typeof catalog)[number]) => {
    const current = connections.find((connection) => connection.provider === item.provider);
    const defaults = item.provider === "printful" ? { endpoint: "https://api.printful.com", scopes: "products, orders, webhooks" } : item.provider === "stripe" ? { endpoint: "https://api.stripe.com", scopes: "checkout, payments, webhooks" } : item.provider === "h3at-management" ? { endpoint: "", scopes: "projects:read, workforce:read, pods:control, tools:invoke, proof:write" } : { endpoint: "", scopes: "" };
    setSelected(item); setEndpoint(current?.endpoint_url || defaults.endpoint); setScopes(current?.scopes.join(", ") || defaults.scopes); setSecret(""); setNotice(""); setPrintfulRuntime(null); setPayouts(null);
    if (item.provider === "printful") void loadPrintfulRuntimeStatus().then(setPrintfulRuntime).catch((error) => setNotice(error instanceof Error ? error.message : "Printful runtime status is unavailable."));
    if (item.provider === "stripe") void loadMerchPayouts(tenantId).then(setPayouts).catch((error) => setNotice(error instanceof Error ? error.message : "Stripe payout status is unavailable."));
  };
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("provider") || query.get("connect");
    if (!requested) return;
    const provider = catalog.find((item) => item.provider === requested);
    if (provider) configure(provider);
    if (requested === "stripe") setNotice(query.get("state") === "complete" ? "Stripe returned the partner to AMX. Account verification status is refreshing." : "Stripe onboarding needs another secure session.");
  }, []);
  const registerPrintfulWebhook = async () => {
    setBusy(true);
    try {
      const result = await configurePrintfulWebhook();
      setNotice(`Printful fulfillment events now route to ${result.callbackHost}.`);
      setPrintfulRuntime(await loadPrintfulRuntimeStatus());
    } catch (error) { setNotice(error instanceof Error ? error.message : "Printful webhook could not be registered."); }
    finally { setBusy(false); }
  };
  const startOnboarding = async () => {
    setBusy(true);
    try {
      const result = await startStripeConnectOnboarding({ tenantId, beneficiaryType, beneficiaryId, displayName: beneficiaryName, contactEmail: beneficiaryEmail });
      window.location.assign(result.onboardingUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Stripe onboarding could not be started."); setBusy(false); }
  };
  const openPayoutDashboard = async (profile: MerchPayoutProfile) => {
    setBusy(true);
    try {
      const result = await openStripeConnectDashboard({ tenantId, beneficiaryType: profile.beneficiaryType, beneficiaryId: profile.beneficiaryId });
      window.location.assign(result.dashboardUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Stripe Express could not be opened."); setBusy(false); }
  };
  const releasePayout = async (allocationId: string, label: string) => {
    if (!window.confirm(`Release the verified revenue allocation to ${label}? This creates a real Stripe transfer.`)) return;
    setBusy(true);
    try { const result = await releaseMerchPayout(tenantId, allocationId); setNotice(`Transfer ${result.transferId} submitted to Stripe.`); setPayouts(await loadMerchPayouts(tenantId)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The payout could not be released."); }
    finally { setBusy(false); }
  };
  const reversePayout = async () => {
    if (!reverseTarget || reversalReason.trim().length < 8) { setNotice("Enter a clear payout reversal reason for the audit record."); return; }
    setBusy(true);
    try { const result = await reverseMerchPayout(tenantId, reverseTarget, reversalReason.trim()); setNotice(`Stripe reversal ${result.reversalId} completed.`); setReverseTarget(""); setReversalReason(""); setPayouts(await loadMerchPayouts(tenantId)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The payout could not be reversed."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!selected) return;
    const current = connections.find((connection) => connection.provider === selected.provider);
    setBusy(true);
    try {
      await saveConnection({ id: current?.id, tenantId, name: selected.name, provider: selected.provider, kind: selected.kind, endpointUrl: endpoint, scopes: scopes.split(",").map((value) => value.trim()).filter(Boolean), secret, status: current?.status || "inactive" });
      setSecret(""); setSelected(null); await refresh(); setNotice(`${selected.name} configuration saved. Secrets remain in the server vault.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Connection could not be saved."); }
    finally { setBusy(false); }
  };
  const toggle = async (connection: PlatformConnection) => {
    setBusy(true);
    try { await setConnectionStatus(connection.id, connection.status === "active" ? "inactive" : "active"); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Connection status could not be changed."); }
    finally { setBusy(false); }
  };
  const active = connections.filter((item) => item.status === "active").length;
  return <div className="page connections-page section-wrap">
    <PageHeader eyebrow="OPERATOR CONNECTION FABRIC" title="Connections" description="Manage APIs, OAuth providers, MCP servers, plugins, skills, webhooks, and tenant-scoped credentials." actions={<button className="button secondary" onClick={() => void refresh()} disabled={busy}><RefreshCw/>Refresh</button>}/>
    <section className="connection-summary"><div><PlugZap/><span><b>{active}</b><small>ACTIVE</small></span></div><div><Unplug/><span><b>{connections.length - active}</b><small>INACTIVE</small></span></div><div><LockKeyhole/><span><b>{connections.filter((item) => item.secret_configured).length}</b><small>VAULTED</small></span></div><div><ShieldCheck/><span><b>{tenantId}</b><small>RLS SCOPE</small></span></div></section>
    {notice && <p className="connection-notice" role="status"><Activity/>{notice}</p>}
    <div className="connections-layout"><section className="connection-registry"><header><div><span className="eyebrow">REGISTRY</span><h2>Platform integrations</h2></div><span>{catalog.length} providers</span></header>{rows.map((item) => <article key={item.provider}><div className="connection-kind"><Cable/><span>{item.kind}</span></div><div><b>{item.name}</b><small>{item.detail}</small></div><div className="connection-state">{item.connection ? <StatusPill tone={item.connection.status === "active" ? "green" : item.connection.status === "error" ? "gold" : "neutral"}>{item.connection.status}</StatusPill> : <StatusPill tone="neutral">not configured</StatusPill>}<small>{item.connection?.secret_configured ? "KEY VAULTED" : "NO SECRET"}</small></div>{item.connection && <button className="icon-button" onClick={() => void toggle(item.connection!)} title={item.connection.status === "active" ? "Deactivate" : "Activate"}>{item.connection.status === "active" ? <Unplug/> : <PlugZap/>}</button>}<button className="button secondary" onClick={() => configure(item)}>{item.connection ? "Manage" : <><Plus/>Connect</>}</button></article>)}</section>
      <aside className="connection-history"><header><div><span className="eyebrow">AUDIT HISTORY</span><h2>Activation timeline</h2></div><Clock3/></header>{history.length ? history.map((entry) => <div key={entry.id}><i className={entry.to_status}/><span><b>{entry.action.replaceAll("_", " ")}</b><small>{entry.from_status || "new"} → {entry.to_status}</small><small>{new Date(entry.created_at).toLocaleString()}</small></span></div>) : <p>No connection changes recorded yet.</p>}</aside>
    </div>
    {selected && <div className="connection-modal" role="dialog" aria-modal="true" aria-label={`Configure ${selected.name}`}><section className={selected.provider === "stripe" ? "payout-modal" : ""}><header><div><span className="eyebrow">{selected.kind.toUpperCase()} CONNECTION</span><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close"><X/></button></header><label>Endpoint URL<input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.provider.example"/></label><label>OAuth scopes / permissions<input value={scopes} onChange={(event) => setScopes(event.target.value)} placeholder="read:rooms, write:events"/></label><label>API key, client secret, or token<input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Leave blank to keep the current vaulted secret"/></label><p><KeyRound/>The credential is sent once to a protected database function and stored in Supabase Vault. It is never returned to this page.</p>{selected.provider === "printful" && <div className="printful-runtime"><span className="eyebrow">FULFILLMENT RUNTIME</span>{printfulRuntime ? <><div><StatusPill tone={printfulRuntime.printful.connected ? "green" : "gold"}>{printfulRuntime.printful.connected ? "API CONNECTED" : "API NEEDS ATTENTION"}</StatusPill><StatusPill tone={printfulRuntime.runtime.stripeConfigured ? "green" : "neutral"}>{printfulRuntime.runtime.stripeConfigured ? "CHECKOUT READY" : "PAYMENT KEY NEEDED"}</StatusPill><StatusPill tone={printfulRuntime.printful.webhookConfigured ? "green" : "neutral"}>{printfulRuntime.printful.webhookConfigured ? "TRACKING LIVE" : "WEBHOOK OFF"}</StatusPill></div><small>{Object.values(printfulRuntime.runtime).filter(Boolean).length}/{Object.keys(printfulRuntime.runtime).length} production bindings ready{printfulRuntime.printful.callbackHost ? ` / ${printfulRuntime.printful.callbackHost}` : ""}</small><PrintfulDiagnostics status={printfulRuntime}/><button className="button secondary full" onClick={() => void registerPrintfulWebhook()} disabled={busy || !printfulRuntime.runtime.fulfillmentWebhookConfigured || !printfulRuntime.runtime.tokenConfigured}><PlugZap/>Register shipping updates</button></> : <small>Checking Worker bindings...</small>}</div>}{selected.provider === "stripe" && <div className="payout-console"><div className="payout-console-head"><span><Landmark/><b>COLLECTIVE PAYOUTS</b></span><StatusPill tone={payouts?.connectConfigured ? "green" : "gold"}>{payouts?.connectConfigured ? "CONNECT READY" : "RUNTIME KEY NEEDED"}</StatusPill></div><div className="payout-onboarding"><label>Beneficiary type<select value={beneficiaryType} onChange={(event) => setBeneficiaryType(event.target.value as MerchPayoutProfile["beneficiaryType"])}><option value="partner">Partner</option><option value="creator">Creator</option><option value="organization">Organization</option><option value="community_fund">Community fund</option></select></label><label>Ledger ID<input value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} placeholder="community-runway"/></label><label>Public name<input value={beneficiaryName} onChange={(event) => setBeneficiaryName(event.target.value)} placeholder="Community Runway"/></label><label>Contact email<input type="email" value={beneficiaryEmail} onChange={(event) => setBeneficiaryEmail(event.target.value)} placeholder="partner@example.com"/></label><button className="button secondary" onClick={() => void startOnboarding()} disabled={busy || !payouts?.connectConfigured}><ExternalLink/>Start secure onboarding</button></div><div className="payout-list"><span className="eyebrow">PAYOUT IDENTITIES</span>{payouts?.profiles.length ? payouts.profiles.map((profile) => <div key={`${profile.beneficiaryType}-${profile.beneficiaryId}`}><span><b>{profile.displayName}</b><small>{profile.beneficiaryType.replaceAll("_", " ")} / {profile.stripeAccountId}</small></span><StatusPill tone={profile.onboardingStatus === "active" ? "green" : profile.onboardingStatus === "disabled" ? "gold" : "neutral"}>{profile.onboardingStatus}</StatusPill><button className="icon-button" title="Open Stripe Express" onClick={() => void openPayoutDashboard(profile)} disabled={busy}><ExternalLink/></button></div>) : <small>No Stripe payout identities are connected yet.</small>}</div><div className="payout-list payable"><span className="eyebrow">PAYABLE AFTER SHIPPING</span>{payouts?.allocations.length ? payouts.allocations.map((allocation) => <div key={allocation.id}><span><b>{allocation.displayName}</b><small>{allocation.orderId} / {(allocation.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: allocation.currency })}</small></span><StatusPill tone={allocation.allocationStatus === "paid" ? "green" : allocation.payoutsEnabled ? "gold" : "neutral"}>{allocation.transferStatus || allocation.allocationStatus}</StatusPill><button className="icon-button" title={allocation.allocationStatus === "paid" ? "Reverse payout" : "Release payout"} onClick={() => allocation.allocationStatus === "paid" ? (setReverseTarget(allocation.id), setReversalReason("")) : void releasePayout(allocation.id, allocation.displayName)} disabled={busy || allocation.allocationStatus === "payable" && !allocation.payoutsEnabled || allocation.allocationStatus === "paid" && allocation.transferStatus !== "submitted"}>{allocation.allocationStatus === "paid" ? <RotateCcw/> : <Send/>}</button></div>) : <small>No shipped-order allocations are awaiting release.</small>}</div>{reverseTarget && <div className="payout-reversal"><label>Reversal reason<input value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Refund, dispute, or approved correction"/></label><button className="button ghost" onClick={() => { setReverseTarget(""); setReversalReason(""); }} disabled={busy}>Cancel</button><button className="button secondary" onClick={() => void reversePayout()} disabled={busy || reversalReason.trim().length < 8}><RotateCcw/>Reverse transfer</button></div>}<p><Banknote/>AMX sends only operator-approved, shipped-order allocations. Stripe handles identity, tax, bank, and payout details.</p></div>}<footer><button className="button ghost" onClick={() => setSelected(null)}>Close</button><button className="button primary" onClick={() => void save()} disabled={busy}><Save/>Save connection</button></footer></section></div>}
  </div>;
}

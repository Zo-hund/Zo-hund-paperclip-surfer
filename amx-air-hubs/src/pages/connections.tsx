import { useEffect, useMemo, useState } from "react";
import { Activity, Cable, Check, Clock3, KeyRound, LockKeyhole, PlugZap, Plus, RefreshCw, Save, ShieldCheck, Unplug, X } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { getActiveTenant } from "../operations";
import { loadConnections, saveConnection, setConnectionStatus, type ConnectionKind, type PlatformConnection, type ConnectionHistory } from "../connection-platform";

const catalog: Array<{ provider: string; name: string; kind: ConnectionKind; detail: string }> = [
  { provider: "openai", name: "OpenAI Agents", kind: "api", detail: "Agent reasoning, vision, voice, and tool calls" },
  { provider: "livekit", name: "LiveKit", kind: "api", detail: "Realtime rooms, voice, video, and agents" },
  { provider: "decart", name: "Decart AI Video", kind: "api", detail: "Lucy 2.5 realtime transformed camera sources" },
  { provider: "supabase", name: "Supabase", kind: "api", detail: "Identity, realtime state, proof, and RLS" },
  { provider: "mcp", name: "MCP Gateway", kind: "mcp", detail: "Governed remote tools and resources" },
  { provider: "streamlabs", name: "Streamlabs", kind: "webhook", detail: "Broadcast scenes, sources, and show control" },
  { provider: "google", name: "Google Workspace", kind: "oauth", detail: "Calendar, Drive, Maps, and event resources" },
  { provider: "skills", name: "AMX Skill Registry", kind: "skill", detail: "Tenant-approved agent capabilities" },
  { provider: "plugins", name: "Plugin Registry", kind: "plugin", detail: "Signed platform extensions" },
];

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
    setSelected(item); setEndpoint(current?.endpoint_url || ""); setScopes(current?.scopes.join(", ") || ""); setSecret(""); setNotice("");
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
    {selected && <div className="connection-modal" role="dialog" aria-modal="true" aria-label={`Configure ${selected.name}`}><section><header><div><span className="eyebrow">{selected.kind.toUpperCase()} CONNECTION</span><h2>{selected.name}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close"><X/></button></header><label>Endpoint URL<input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.provider.example"/></label><label>OAuth scopes / permissions<input value={scopes} onChange={(event) => setScopes(event.target.value)} placeholder="read:rooms, write:events"/></label><label>API key, client secret, or token<input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Leave blank to keep the current vaulted secret"/></label><p><KeyRound/>The credential is sent once to a protected database function and stored in Supabase Vault. It is never returned to this page.</p><footer><button className="button ghost" onClick={() => setSelected(null)}>Cancel</button><button className="button primary" onClick={() => void save()} disabled={busy}><Save/>Save connection</button></footer></section></div>}
  </div>;
}

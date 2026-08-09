import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, CheckCircle2, CircleGauge, CloudCog, Database, Gauge, Network, Play, RefreshCw, Router, ShieldCheck, Square, Users, WalletCards, Wifi } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { formatDataUnits, getAirConnectState, runAirConnectAction, type AirConnectState, type AirRuntime } from "../air-connect";
import { getActiveTenant } from "../operations";

const emptyState: AirConnectState = { pools: [], runtimes: [], providers: [], nodes: [], policies: [], edgeCommands: [], usageSamples: [], sessions: [], alerts: [], reports: [], walletSummary: { wallets: 0, creditsIssued: 0 }, transactions: [], persisted: false };
const sections = ["Overview", "Providers", "Pools", "Rooms", "Containers", "Devices", "Usage", "Policies", "Transactions", "Alerts", "Reports"];

function activeRuntime(runtimes: AirRuntime[]) {
  return runtimes.find((runtime) => runtime.status === "active") || runtimes.find((runtime) => runtime.status === "allocated") || runtimes[0];
}

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export function AirConnectPage() {
  const tenantId = getActiveTenant();
  const [state, setState] = useState<AirConnectState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [section, setSection] = useState("Overview");
  const [usageUnits, setUsageUnits] = useState(91_000);
  const [resizeUnits, setResizeUnits] = useState(250_000);
  const [resizeMbps, setResizeMbps] = useState(500);
  const provider = state.providers[0];
  const node = state.nodes[0];
  const pool = state.pools[0];
  const runtime = useMemo(() => activeRuntime(state.runtimes), [state.runtimes]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setState(await getAirConnectState(tenantId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "AIR Connect state could not be loaded"); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (runtime?.consumedUnits) setUsageUnits(runtime.consumedUnits);
    if (runtime?.allocationUnits) setResizeUnits(runtime.allocationUnits);
    if (runtime?.bandwidthMbps) setResizeMbps(runtime.bandwidthMbps);
  }, [runtime?.allocationUnits, runtime?.bandwidthMbps, runtime?.consumedUnits]);

  const act = async (label: string, action: string, input: Record<string, unknown> = {}) => {
    setWorking(label);
    setError("");
    try { await runAirConnectAction(tenantId, action, input); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label} failed`); }
    finally { setWorking(""); }
  };

  const activeRooms = state.runtimes.filter((item) => item.status === "active").length;
  const learners = state.runtimes.reduce((sum, item) => sum + item.learnerCount, 0);
  const poolPercent = pool ? Math.round(pool.availableUnits / Math.max(pool.totalUnits, 1) * 100) : 0;
  const latestPolicy = state.policies.find((item) => item.runtimeId === runtime?.id);
  const latestCommand = state.edgeCommands.find((item) => item.runtimeId === runtime?.id);
  const latestReport = state.reports.find((item) => item.runtimeId === runtime?.id)?.payload || runtime?.report;
  const reportCost = latestReport?.cost as Record<string, unknown> | undefined;

  return <div className="page air-connect-page">
    <div className="section-wrap"><PageHeader eyebrow="AMX AIR CONNECT / PROGRAMMABLE INVENTORY" title="Connectivity orchestration" description="Buy compliant upstream capacity, pool it, allocate governed room containers, meter delivery, reclaim unused data, and report utilization and cost." actions={<button className="icon-button" type="button" onClick={() => void refresh()} disabled={loading || Boolean(working)} title="Refresh AIR Connect" aria-label="Refresh AIR Connect"><RefreshCw/></button>}/></div>
    <section className="air-connect-status"><div className="section-wrap"><StatusPill tone={error ? "gold" : "green"}>{error ? "attention" : loading ? "syncing" : "operational"}</StatusPill><span><ShieldCheck/>TENANT / {tenantId}</span><span><Wifi/>QOS / P0-P5</span><span><Database/>LEDGER / IMMUTABLE</span><span><Network/>EDGE / {node?.status || "UNREGISTERED"}</span></div></section>
    <nav className="section-wrap air-connect-subnav" aria-label="AIR Connect modules">{sections.map((item) => <button type="button" className={section === item ? "active" : ""} onClick={() => setSection(item)} key={item}>{item}</button>)}</nav>
    <div className="section-wrap air-connect-workspace">
      {error && <div className="air-connect-alert" role="alert"><Activity/><span>{error}</span></div>}
      <section className="air-connect-kpis" aria-label="AIR Connect summary">
        <div><Database/><span>POOL TOTAL</span><b>{pool ? formatDataUnits(pool.totalUnits) : "NOT CREATED"}</b><small>{provider ? `${provider.downloadMbps}/${provider.uploadMbps} Mbps upstream` : "Register a provider contract"}</small></div>
        <div><Gauge/><span>AVAILABLE</span><b>{pool ? formatDataUnits(pool.availableUnits) : "0 MB"}</b><small>{pool ? `${poolPercent}% ready to reallocate` : "Provision the first pool"}</small></div>
        <div><CloudCog/><span>ACTIVE ROOMS</span><b>{activeRooms}</b><small>{state.runtimes.length} total containers</small></div>
        <div><Router/><span>EDGE COMMAND</span><b>{latestCommand?.status?.toUpperCase() || "NONE"}</b><small>{latestCommand ? `${latestCommand.action} / ${latestCommand.signatureAlgorithm}` : "No network change queued"}</small></div>
        <div><Users/><span>LEARNERS</span><b>{learners}</b><small>{state.usageSamples.length} usage samples retained</small></div>
      </section>

      {section === "Overview" && <div className="air-connect-grid">
        <section className="air-connect-runbook">
          <header><div><span className="eyebrow">MVP ACCEPTANCE RUN</span><h2>Hub 001 / Room A / v0.2</h2></div><StatusPill tone="cyan">SIGNED EDGE</StatusPill></header>
          <div className="air-connect-steps">
            <article data-complete={Boolean(provider)}><i>01</i><div><b>Register provider rights</b><span>5 TB business service, 2 Gbps down, 1 Gbps up, $1,500 monthly contract.</span></div><button className="button secondary compact" disabled={Boolean(provider) || Boolean(working)} onClick={() => void act("Registering provider", "register_provider", { name: "AMX Hub 001 Business Fiber", dataCapMb: 5_000_000, downloadMbps: 2_000, uploadMbps: 1_000, monthlyCostCents: 150_000, rights: { multiUser: true, commercialUse: true, guestAccess: true, multiTenant: true, dataPooling: true } })}>{provider ? <CheckCircle2/> : <ShieldCheck/>}{provider ? "Verified" : "Register"}</button></article>
            <article data-complete={Boolean(node)}><i>02</i><div><b>Register the hybrid edge</b><span>OPNsense policy core, UniFi room access, AIR Box portability, and upstream radio telemetry.</span></div><button className="button secondary compact" disabled={Boolean(node) || Boolean(working)} onClick={() => void act("Registering edge", "register_edge_node", { name: "AMX Hybrid Edge 001", nodeId: "edge-hub-001", locationId: "hub-001", adapterType: "opnsense-unifi", capabilities: ["qos", "vlan", "captive-portal", "client-quota", "usage-meter", "upstream-telemetry"] })}>{node ? <CheckCircle2/> : <Router/>}{node ? "Registered" : "Register"}</button></article>
            <article data-complete={Boolean(pool)}><i>03</i><div><b>Create the 5 TB pool</b><span>Contract-backed capacity with provider rights and upstream cost attached.</span></div><button className="button secondary compact" disabled={!provider || Boolean(pool) || Boolean(working)} onClick={() => void act("Creating pool", "create_pool", { providerId: provider?.id, locationId: "hub-001", name: "AMX Hub 001 August Pool", totalUnits: 5_000_000 })}>{pool ? <CheckCircle2/> : <Database/>}{pool ? "Created" : "Create 5 TB"}</button></article>
            <article data-complete={Boolean(runtime)}><i>04</i><div><b>Allocate Room A</b><span>250 GB / 500:250 Mbps / 30 learners / 3 trainers / 3 agents / 40 devices.</span></div><button className="button secondary compact" disabled={!pool || !node || Boolean(runtime) || Boolean(working)} onClick={() => void act("Allocating room", "allocate_room", { poolId: pool?.id, edgeNodeId: node?.id, roomCode: "ROOM-A", eventId: "xrt-pathfinder", programId: "community-workshop", allocationUnits: 250_000, learnerCount: 30, trainerCount: 3, agentCount: 3, bandwidthMbps: 500, uploadLimitMbps: 250, minGuaranteedMbps: 100, burstLimitMbps: 700, maxUsers: 33, maxDevices: 40, priorityClass: "P1", videoProfile: "720p" })}>{runtime ? <CheckCircle2/> : <CircleGauge/>}{runtime ? "Allocated" : "Allocate"}</button></article>
            <article data-complete={runtime?.status === "active" || runtime?.status === "closed"}><i>05</i><div><b>Push signed room policy</b><span>Starts LiveKit and queues the P0-P5 network policy; online status waits for edge ACK.</span></div><button className="button primary compact" disabled={runtime?.status !== "allocated" || Boolean(working)} onClick={() => void act("Starting room", "start_room", { runtimeId: runtime?.id, ssid: "AMX-ROOM-A", vlan: 120 })}><Play/>{runtime?.status === "active" ? "Live" : runtime?.status === "closed" ? "Completed" : "Start room"}</button></article>
            <article data-complete={runtime?.consumedUnits === 91_000}><i>06</i><div><b>Meter the workshop</b><span>Record aggregate usage and quality without collecting browsing history.</span></div><label><input type="number" min="1" max={runtime?.allocationUnits || 250_000} step="1000" value={usageUnits} disabled={runtime?.status !== "active"} onChange={(event) => setUsageUnits(Number(event.target.value))}/><button className="button secondary compact" disabled={runtime?.status !== "active" || Boolean(working)} onClick={() => void act("Recording usage", "record_usage", { runtimeId: runtime?.id, consumedUnits: usageUnits, deviceId: "room-a-meter", downloadMbps: 386, uploadMbps: 72, latencyMs: 31, jitterMs: 7, packetLoss: 0.2 })}><CircleGauge/>Meter</button></label></article>
            <article data-complete={runtime?.status === "closed"}><i>07</i><div><b>Close, return, and report</b><span>Stops admissions, removes policy, returns 159 GB, reports cost, and rewards learners.</span></div><button className="button secondary compact" disabled={runtime?.status !== "active" || Boolean(working)} onClick={() => void act("Closing room", "close_room", { runtimeId: runtime?.id, rewardUnits: 100 })}><Square/>{runtime?.status === "closed" ? "Closed" : "Close runtime"}</button></article>
          </div>
          {working && <div className="air-connect-working"><RefreshCw/><span>{working}</span></div>}
        </section>

        <aside className="air-connect-runtime">
          <header><span className="eyebrow">ROOM CONTAINER</span><StatusPill tone={runtime?.status === "active" ? "green" : runtime?.status === "closed" ? "cyan" : "gold"}>{runtime?.status || "standby"}</StatusPill></header>
          {runtime ? <><h2>{runtime.name}</h2><p>{runtime.livekitRoom}</p><dl>
            <div><dt>Allocation</dt><dd>{formatDataUnits(runtime.allocationUnits)}</dd></div><div><dt>Consumed</dt><dd>{formatDataUnits(runtime.consumedUnits)}</dd></div><div><dt>Cohort</dt><dd>{runtime.learnerCount} learners / {runtime.trainerCount} trainers / {runtime.agentCount} agents</dd></div><div><dt>Entitlement</dt><dd>{runtime.profile?.downloadLimitMbps || runtime.bandwidthMbps}/{runtime.profile?.uploadLimitMbps || 0} Mbps</dd></div><div><dt>Guarantee / burst</dt><dd>{runtime.profile?.minGuaranteedMbps || 0}/{runtime.profile?.burstLimitMbps || 0} Mbps</dd></div><div><dt>Devices</dt><dd>{runtime.profile?.maxDevices || 0} max</dd></div><div><dt>Policy</dt><dd>v{runtime.profile?.policyVersion || 0} / {latestPolicy?.status || "not pushed"}</dd></div><div><dt>JAZ dispatch</dt><dd>{runtime.livekitDispatch?.dispatched ? "Joined" : runtime.livekitDispatch?.configured ? "Pending" : "Not configured"}</dd></div>
          </dl><div className="air-connect-meter"><i style={{ width: `${Math.min(100, runtime.consumedUnits / Math.max(runtime.allocationUnits, 1) * 100)}%` }}/></div>
            {["allocated", "active"].includes(runtime.status) && <div className="air-connect-resize"><b>Live entitlement</b><label><span>Data MB</span><input type="number" min={Math.max(runtime.consumedUnits, 1)} step="25000" value={resizeUnits} onChange={(event) => setResizeUnits(Number(event.target.value))}/></label><label><span>Down Mbps</span><input type="number" min="1" step="50" value={resizeMbps} onChange={(event) => setResizeMbps(Number(event.target.value))}/></label><button className="button secondary compact" disabled={Boolean(working)} onClick={() => void act("Resizing room", "resize_room", { runtimeId: runtime.id, allocationUnits: resizeUnits, bandwidthMbps: resizeMbps, uploadLimitMbps: Math.max(1, Math.round(resizeMbps / 2)) })}><Gauge/>Apply</button></div>}
            {latestReport && <div className="air-connect-report"><CheckCircle2/><span><b>Closeout report generated</b><small>{formatDataUnits(Number(latestReport.returnedUnits || 0))} returned / {money(Number(reportCost?.connectivityCents || 0), String(reportCost?.currency || "USD"))} room cost</small></span></div>}
          </> : <div className="air-connect-empty"><Bot/><b>No room allocated</b><span>Complete provider, edge, and pool setup to prepare Room A.</span></div>}
        </aside>
      </div>}

      {section !== "Overview" && <section className="air-connect-module"><header><div><span className="eyebrow">ADMIN MODULE</span><h2>{section}</h2></div><span>Tenant-scoped operational records</span></header><div className="air-connect-module-grid">
        {section === "Providers" && state.providers.map((item) => <article key={item.id}><b>{item.name}</b><span>{item.serviceType} / {item.downloadMbps}:{item.uploadMbps} Mbps</span><small>{formatDataUnits(item.dataCapMb)} / {money(item.monthlyCostCents, item.currency)} / pooling {item.rights.dataPooling ? "allowed" : "blocked"}</small></article>)}
        {section === "Pools" && state.pools.map((item) => <article key={item.id}><b>{item.name}</b><span>{formatDataUnits(item.availableUnits)} available of {formatDataUnits(item.totalUnits)}</span><small>{item.locationId} / {item.downloadCapacityMbps}:{item.uploadCapacityMbps} Mbps</small></article>)}
        {["Rooms", "Containers"].includes(section) && state.runtimes.map((item) => <article key={item.id}><b>{item.roomCode} / {item.status}</b><span>{formatDataUnits(item.allocationUnits)} / {item.profile?.maxDevices || 0} devices</span><small>{item.profile?.priorityClass || "legacy"} / {item.livekitRoom}</small></article>)}
        {section === "Devices" && state.sessions.map((item) => <article key={item.id}><b>{item.deviceId}</b><span>{item.roomId} / {formatDataUnits(item.totalMb)}</span><small>{item.disconnectedAt ? `Closed / ${item.terminationReason}` : "Connected"}</small></article>)}
        {section === "Usage" && state.usageSamples.map((item) => <article key={item.id}><b>{item.roomId} / {formatDataUnits(Math.round((item.bytesDown + item.bytesUp) / 1024 / 1024))}</b><span>{item.downloadMbps}:{item.uploadMbps} Mbps / {item.latencyMs} ms</span><small>{new Date(item.recordedAt).toLocaleString()} / {item.deviceId}</small></article>)}
        {section === "Policies" && state.policies.map((item) => <article key={item.id}><b>{item.roomId} / policy v{item.version}</b><span>{item.status} / {String(item.payload.priorityClass || "P1")}</span><small>{item.appliedAt ? `Applied ${new Date(item.appliedAt).toLocaleString()}` : "Awaiting edge acknowledgement"}</small></article>)}
        {section === "Transactions" && state.transactions.map((item) => <article key={item.id}><b>{item.type.replace(/_/g, " ")}</b><span>{item.amountUnits > 0 ? "+" : ""}{item.resourceType === "DATA_MB" ? formatDataUnits(item.amountUnits) : item.amountUnits}</span><small>{item.reason} / {new Date(item.createdAt).toLocaleString()}</small></article>)}
        {section === "Alerts" && state.alerts.map((item) => <article key={item.id}><b>{item.severity.toUpperCase()} / {item.type}</b><span>{item.message}</span><small>{String(item.payload.recommendation || item.status)}</small></article>)}
        {section === "Reports" && state.reports.map((item) => <article key={item.id}><b>{item.type} / {String(item.payload.roomCode || item.runtimeId)}</b><span>{formatDataUnits(Number(item.payload.consumedUnits || 0))} consumed / {formatDataUnits(Number(item.payload.returnedUnits || 0))} returned</span><small>{new Date(item.generatedAt).toLocaleString()}</small></article>)}
        {!((section === "Providers" && state.providers.length) || (section === "Pools" && state.pools.length) || (["Rooms", "Containers"].includes(section) && state.runtimes.length) || (section === "Devices" && state.sessions.length) || (section === "Usage" && state.usageSamples.length) || (section === "Policies" && state.policies.length) || (section === "Transactions" && state.transactions.length) || (section === "Alerts" && state.alerts.length) || (section === "Reports" && state.reports.length)) && <div className="air-connect-empty"><Database/><b>No {section.toLowerCase()} records yet</b><span>Run the acceptance mission from Overview to create this operational history.</span></div>}
      </div></section>}

      <section className="air-connect-policy"><header><div><span className="eyebrow">ADAPTIVE QOS POLICY</span><h2>Room traffic priorities</h2></div><span>Peer-to-peer blocked / background updates throttled</span></header><div><article><b>P0</b><span>Emergency + operator control</span><small>Never degraded</small></article><article><b>P1</b><span>Voice + LiveKit audio</span><small>Protected low-latency path</small></article><article><b>P2</b><span>Trainer video + LMS</span><small>Adaptive delivery</small></article></div></section>

      <section className="air-connect-ledger"><header><div><span className="eyebrow">RESOURCE LEDGER</span><h2>Tenant audit history</h2></div><span>{state.transactions.length} recent entries</span></header><div className="air-connect-table"><div className="air-connect-table-head"><span>Time</span><span>Action</span><span>Resource</span><span>Amount</span><span>Reason</span><span>Actor</span></div>{state.transactions.map((entry) => <div className="air-connect-table-row" key={entry.id}><time>{new Date(entry.createdAt).toLocaleString()}</time><b>{entry.type.replace(/_/g, " ")}</b><span>{entry.resourceType}</span><strong className={entry.amountUnits < 0 ? "negative" : "positive"}>{entry.amountUnits > 0 ? "+" : ""}{entry.resourceType === "DATA_MB" ? formatDataUnits(entry.amountUnits) : entry.amountUnits.toLocaleString()}</strong><span>{entry.reason}</span><code>{entry.actorId}</code></div>)}{!state.transactions.length && <div className="air-connect-table-empty">The first resource action will create the immutable ledger.</div>}</div></section>
    </div>
  </div>;
}

import { useEffect, useMemo, useState } from "react";
import { Banknote, Bot, CheckCircle2, CircleDollarSign, Coins, DatabaseZap, Network, ReceiptText, ShieldCheck, WalletCards, Zap } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { buildX402HttpExample, cents, defaultX402Policy, quoteX402Service, serverQuotePayload, x402Agents, x402Api, x402ServiceCatalog, type X402Quote } from "../x402-economy";

const assets = ["AMX Member", "AMX Builder", "AMX Partner", "AMX Producer", "AMX Operator"];
type X402Health = { status: { configured: boolean; mode: string; missing: string[]; settlementEnabled: boolean }; ledgerConfigured: boolean };
type X402LedgerRow = { id: string; service_id: string; event_type?: string; status: string; approval_status?: string; amount_cents: number; created_at?: string; updated_at?: string };
type X402Ledger = { events: X402LedgerRow[]; approvals: X402LedgerRow[]; meters: X402LedgerRow[]; persisted: boolean };
type ServerQuote = { quote: X402Quote & { id?: string; provider?: string }; paymentRequirement?: { status: number }; runtime?: X402Health["status"] };

export function X402EconomyPage() {
  const [serviceId, setServiceId] = useState(x402ServiceCatalog[0].id);
  const [asset, setAsset] = useState("AMX Builder");
  const [connected, setConnected] = useState(false);
  const [remaining, setRemaining] = useState(defaultX402Policy.remainingCents);
  const [autopay, setAutopay] = useState(defaultX402Policy.allowAutopayBelowCents);
  const [health, setHealth] = useState<X402Health | null>(null);
  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const [ledger, setLedger] = useState<X402Ledger | null>(null);
  const [apiMessage, setApiMessage] = useState("Server contract not checked yet.");
  const quote = useMemo(() => quoteX402Service({
    serviceId,
    memberAsset: asset,
    x402Connected: connected,
    policy: { ...defaultX402Policy, remainingCents: remaining, allowAutopayBelowCents: autopay },
  }), [serviceId, asset, connected, remaining, autopay]);
  const service = x402ServiceCatalog.find((item) => item.id === serviceId) || x402ServiceCatalog[0];
  const statusTone = quote.status === "blocked" ? "red" : quote.status === "requires_connection" ? "gold" : quote.status === "simulated_paid" ? "green" : "cyan";
  const loadLedger = () => x402Api<X402Ledger>("/api/x402/ledger?tenantId=tech-at-nite").then(setLedger).catch((error: Error) => setApiMessage(error.message));
  useEffect(() => {
    x402Api<X402Health>("/api/x402/health").then((data) => {
      setHealth(data);
      setConnected(data.status.configured);
      setApiMessage(data.status.configured ? "x402 backend is configured." : `Simulation mode: missing ${data.status.missing.join(", ") || "live settlement approval"}.`);
    }).catch((error: Error) => setApiMessage(error.message));
    loadLedger();
  }, []);
  const requestServerQuote = async () => {
    const payload = serverQuotePayload({ serviceId, memberAsset: asset, remainingCents: remaining, autopayCents: autopay });
    const result = await x402Api<ServerQuote>("/api/x402/quote", { method: "POST", body: JSON.stringify(payload) });
    setServerQuote(result);
    setApiMessage(`Server quote returned HTTP ${result.paymentRequirement?.status || 200} for ${result.quote.serviceId}.`);
    await loadLedger();
  };
  const authorizeServerQuote = async () => {
    const payload = { ...serverQuotePayload({ serviceId, memberAsset: asset, remainingCents: remaining, autopayCents: autopay }), quoteId: serverQuote?.quote.id, reason: "Release 149 operator x402 approval rehearsal" };
    const result = await x402Api<{ approvalRequired?: boolean; authorized?: boolean; approval?: { id: string; status: string } }>("/api/x402/authorize", { method: "POST", body: JSON.stringify(payload) });
    setApiMessage(result.authorized ? "Authorization recorded and metered." : `Approval queued: ${result.approval?.id || "operator review required"}.`);
    await loadLedger();
  };

  return <div className="page section-wrap x402-page">
    <PageHeader eyebrow="AMX AGENT ECONOMY / X402" title="Agent-to-agent payment rail" description="Model paid skills, partner APIs, usage meters, approvals, and revenue splits before connecting a live x402 wallet or facilitator." actions={<StatusPill tone={statusTone}>{quote.status.replaceAll("_", " ")}</StatusPill>}/>

    <section className="x402-status-grid">
      <div><CircleDollarSign/><span><b>{cents(quote.amountCents)}</b><small>QUOTE</small></span></div>
      <div><WalletCards/><span><b>{connected ? "CONNECTED" : "SIMULATION"}</b><small>PAYMENT RAIL</small></span></div>
      <div><ShieldCheck/><span><b>{quote.approvalRequired ? "REQUIRED" : "AUTO"}</b><small>HUMAN APPROVAL</small></span></div>
      <div><Coins/><span><b>{cents(remaining)}</b><small>DAILY REMAINING</small></span></div>
    </section>

    <section className="x402-backend">
      <div><DatabaseZap/><span><b>{health?.status.mode || "checking"}</b><small>{health?.ledgerConfigured ? "LEDGER READY" : "LEDGER LOCAL/OFF"}</small></span></div>
      <div><ShieldCheck/><span><b>{health?.status.settlementEnabled ? "SETTLEMENT ON" : "SETTLEMENT HELD"}</b><small>{health?.status.missing.join(", ") || "operator policy active"}</small></span></div>
      <button type="button" onClick={requestServerQuote}>Request server quote</button>
      <button type="button" onClick={authorizeServerQuote}>Authorize / approval</button>
      <p>{apiMessage}</p>
    </section>

    <div className="x402-layout">
      <section className="x402-console">
        <div className="section-heading"><div><span className="eyebrow">QUOTE BUILDER</span><h2>Service request</h2></div><StatusPill tone={statusTone}>{service.category}</StatusPill></div>
        <label>AMX service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{x402ServiceCatalog.map((item) => <option key={item.id} value={item.id}>{item.name} / {cents(item.priceCents)}</option>)}</select></label>
        <label>Identity asset<select value={asset} onChange={(event) => setAsset(event.target.value)}>{assets.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="x402-range-row"><label>Remaining daily budget<input type="range" min="0" max="5000" step="50" value={remaining} onChange={(event) => setRemaining(Number(event.target.value))}/><small>{cents(remaining)}</small></label><label>Autopay ceiling<input type="range" min="0" max="1000" step="25" value={autopay} onChange={(event) => setAutopay(Number(event.target.value))}/><small>{cents(autopay)}</small></label></div>
        <label className="x402-toggle"><input type="checkbox" checked={connected} onChange={(event) => setConnected(event.target.checked)}/><span><Zap/><b>Simulate x402 connection active</b><small>Live settlement still requires a vaulted provider connection and operator policy.</small></span></label>
        <div className="x402-http"><span className="eyebrow">HTTP-NATIVE PAYMENT FLOW</span><code>{buildX402HttpExample(quote)}</code><p>{quote.reason}</p></div>
      </section>

      <aside className="x402-receipt">
        <span className="eyebrow">PAYMENT REQUIREMENT</span>
        <h2>{service.name}</h2>
        <p>{service.description}</p>
        <dl>
          <div><dt>Endpoint</dt><dd>{service.endpoint}</dd></div>
          <div><dt>Provider</dt><dd>{service.provider}</dd></div>
          <div><dt>Member discount</dt><dd>{cents(quote.memberDiscountCents)}</dd></div>
          <div><dt>Pay to</dt><dd>{quote.payTo}</dd></div>
        </dl>
      </aside>
    </div>

    <section className="x402-splits">
      <div className="section-heading"><div><span className="eyebrow">SETTLEMENT SPLIT</span><h2>Collective economics ledger</h2></div><ReceiptText/></div>
      <div>{Object.entries(quote.split).map(([key, value]) => <article key={key}><span>{key.replace("Pct", "").replace(/([A-Z])/g, " $1")}</span><b>{cents(value)}</b></article>)}</div>
    </section>

    <section className="x402-ledger">
      <div className="section-heading"><div><span className="eyebrow">SERVER LEDGER</span><h2>Quotes, approvals, and meters</h2></div><DatabaseZap/></div>
      <div>
        {(ledger?.approvals || []).slice(0, 3).map((item) => <article key={item.id}><span>Approval</span><b>{item.service_id}</b><small>{item.status} / {cents(item.amount_cents)}</small></article>)}
        {(ledger?.events || []).slice(0, 3).map((item) => <article key={item.id}><span>{item.event_type || "Event"}</span><b>{item.service_id}</b><small>{item.status} / {item.approval_status || "audit"}</small></article>)}
        {!ledger?.approvals.length && !ledger?.events.length ? <article><span>Ledger</span><b>No server rows yet</b><small>Request a server quote to write an audit event.</small></article> : null}
      </div>
    </section>

    <section className="x402-agent-grid">
      <div className="section-heading"><div><span className="eyebrow">AGENT ROSTER</span><h2>Payment, wallet, metering, and compliance agents</h2></div><Bot/></div>
      <div>{x402Agents.map((agent) => <article key={agent.id}><Network/><span>{agent.role}</span><h3>{agent.name}</h3><p>{agent.purpose}</p><ul>{agent.toolbelt.map((tool) => <li key={tool}><CheckCircle2/>{tool}</li>)}</ul></article>)}</div>
    </section>

    <section className="x402-service-grid">
      <div className="section-heading"><div><span className="eyebrow">SERVICE MARKETPLACE</span><h2>Pay-per-use AMX and partner skills</h2></div><Banknote/></div>
      <div>{x402ServiceCatalog.map((item) => <button key={item.id} className={item.id === serviceId ? "active" : ""} onClick={() => setServiceId(item.id)}><span>{item.category}</span><b>{item.name}</b><small>{item.endpoint}</small><strong>{cents(item.memberPriceCents)} member / {cents(item.priceCents)} standard</strong></button>)}</div>
    </section>
  </div>;
}

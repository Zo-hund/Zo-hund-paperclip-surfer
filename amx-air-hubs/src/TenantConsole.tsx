import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Bot, BookOpenCheck, Building2, Check, FileBadge, Plus, Radio, Save, School, ShieldCheck, WalletCards, X,
} from "lucide-react";
import { useAMX } from "./AppContext";
import { agents, marketplaceOffers, missions } from "./data";
import { getActiveTenant, setActiveTenant } from "./operations";
import { trackEvent } from "./platform";
import { PageHeader, StatusPill } from "./components";
import { createTenantDraft, getTenantRecords, saveTenantRecord, slugify, type TenantRecord } from "./tenant-management";

function toggle(items: string[], id: string) {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

interface TenantEditorProps {
  draft: TenantRecord;
  isNew: boolean;
  onChange: (draft: TenantRecord) => void;
  onClose: () => void;
  onSave: () => void;
  error: string;
}

function TenantEditor({ draft, isNew, onChange, onClose, onSave, error }: TenantEditorProps) {
  const patch = (value: Partial<TenantRecord>) => onChange({ ...draft, ...value });
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="builder-modal wide tenant-editor" role="dialog" aria-modal="true" aria-labelledby="tenant-editor-title" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <div className="tenant-editor-head"><div><span className="eyebrow">ORGANIZATION CONFIGURATION</span><h2 id="tenant-editor-title">{isNew ? "Add tenant" : `Edit ${draft.name}`}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close tenant editor"><X/></button></div>
      <div className="builder-grid">
        <label>Organization name<input autoFocus value={draft.name} onChange={(event) => patch({ name: event.target.value, ...(isNew ? { id: slugify(event.target.value), proofScope: slugify(event.target.value), certificateName: event.target.value, proofSignature: `${slugify(event.target.value)}-proof` } : {}) })}/></label>
        <label>Organization type<input value={draft.type} onChange={(event) => patch({ type: event.target.value })}/></label>
        <label>Tenant ID<input value={draft.id} disabled={!isNew} onChange={(event) => patch({ id: slugify(event.target.value) })}/></label>
        <label>Brand color<span className="tenant-color-input"><input type="color" value={draft.color} onChange={(event) => patch({ color: event.target.value })}/><code>{draft.color}</code></span></label>
        <label>Proof scope<input value={draft.proofScope} onChange={(event) => patch({ proofScope: slugify(event.target.value) })}/></label>
        <label>Proof signature<input value={draft.proofSignature} onChange={(event) => patch({ proofSignature: slugify(event.target.value) })}/></label>
        <label>Certificate identity<input value={draft.certificateName} onChange={(event) => patch({ certificateName: event.target.value })}/></label>
        <label>Certificate sponsor<input value={draft.certificateSponsor} onChange={(event) => patch({ certificateSponsor: event.target.value })}/></label>
        <label className="span-2">Report template<textarea value={draft.reportTemplate} onChange={(event) => patch({ reportTemplate: event.target.value })}/></label>
      </div>
      <fieldset className="tenant-scope-set"><legend>Enabled missions</legend><div>{missions.map((mission) => <label key={mission.id}><input type="checkbox" checked={draft.missionIds.includes(mission.id)} onChange={() => patch({ missionIds: toggle(draft.missionIds, mission.id) })}/><span><b>{mission.title}</b><small>{mission.domain}</small></span></label>)}</div></fieldset>
      <fieldset className="tenant-scope-set"><legend>Agent roster</legend><div>{agents.map((agent) => <label key={agent.id}><input type="checkbox" checked={draft.agentIds.includes(agent.id)} onChange={() => patch({ agentIds: toggle(draft.agentIds, agent.id) })}/><span><b>{agent.name}</b><small>{agent.role}</small></span></label>)}</div></fieldset>
      <fieldset className="tenant-scope-set"><legend>Marketplace offers</legend><div>{marketplaceOffers.map((offer) => <label key={offer.id}><input type="checkbox" checked={draft.marketplaceOfferIds.includes(offer.id)} onChange={() => patch({ marketplaceOfferIds: toggle(draft.marketplaceOfferIds, offer.id) })}/><span><b>{offer.title}</b><small>{offer.type}</small></span></label>)}</div></fieldset>
      {error && <p className="tenant-form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button type="submit" className="button primary"><Save/>Save configuration</button></div>
    </form>
  </div>;
}

export function TenantConsolePage() {
  const { activeMission, selectedAgentId, setActiveMissionId, setSelectedAgentId } = useAMX();
  const [records, setRecords] = useState(getTenantRecords);
  const [active, setActive] = useState(getActiveTenant);
  const [draft, setDraft] = useState<TenantRecord | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = records.find((tenant) => tenant.id === active) || records[0];

  const applyScope = (tenant: TenantRecord) => {
    if (!tenant.missionIds.includes(activeMission.id) && tenant.missionIds[0]) setActiveMissionId(tenant.missionIds[0]);
    if (!tenant.agentIds.includes(selectedAgentId) && tenant.agentIds[0]) setSelectedAgentId(tenant.agentIds[0]);
  };
  const choose = (tenant: TenantRecord) => {
    setActiveTenant(tenant.id);
    setActive(tenant.id);
    applyScope(tenant);
    setNotice(`${tenant.name} scope is active.`);
    trackEvent("tenant_switched", { tenantId: tenant.id });
  };
  const openEditor = (tenant: TenantRecord, creating = false) => {
    setDraft({ ...tenant, missionIds: [...tenant.missionIds], agentIds: [...tenant.agentIds], marketplaceOfferIds: [...tenant.marketplaceOfferIds] });
    setIsNew(creating);
    setError("");
  };
  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.id) return setError("Organization name and tenant ID are required.");
    if (!draft.missionIds.length || !draft.agentIds.length) return setError("Enable at least one mission and one agent.");
    if (isNew && records.some((tenant) => tenant.id === draft.id)) return setError("That tenant ID is already in use.");
    const saved = saveTenantRecord(draft);
    const next = getTenantRecords();
    setRecords(next);
    setDraft(null);
    choose(saved);
    setNotice(`${saved.name} configuration saved.`);
    trackEvent(isNew ? "tenant_created" : "tenant_updated", { tenantId: saved.id });
  };

  return <div className="page section-wrap">
    <PageHeader eyebrow="TENANT / ORGANIZATION SYSTEM" title="Organization console" description="Switch the active mission catalog, agent roster, proof scope, and partner identity." actions={<button className="button primary" onClick={() => openEditor(createTenantDraft(), true)}><Plus/>Add tenant</button>}/>
    <p className="tenant-notice" aria-live="polite">{notice || `${current.name} is active across missions, agents, proof, and marketplace.`}</p>
    <div className="tenant-console-layout"><section className="tenant-list" aria-label="Organizations">{records.map((tenant) => <button key={tenant.id} className={tenant.id === active ? "selected" : ""} onClick={() => choose(tenant)} aria-pressed={tenant.id === active}><span className="tenant-symbol" style={{ borderColor: tenant.color, color: tenant.color }}>{tenant.name.slice(0, 2).toUpperCase()}</span><div><h3>{tenant.name}</h3><p>{tenant.type}</p></div>{tenant.id === active && <Check/>}</button>)}</section>
    <aside className="tenant-detail" style={{ "--tenant": current.color } as CSSProperties}><span className="eyebrow">ACTIVE TENANT</span><h2>{current.name}</h2><StatusPill tone="green">Scoped</StatusPill><div className="tenant-facts"><span><Building2/>ORGANIZATION<b>{current.type}</b></span><span><Radio/>MISSIONS<b>{current.missionIds.length} enabled</b></span><span><Bot/>AGENTS<b>{current.agentIds.map((id) => agents.find((agent) => agent.id === id)?.name || id).join(" / ")}</b></span><span><ShieldCheck/>PROOF SCOPE<b>{current.proofScope}</b></span></div><Link className="button primary full" to={`/tenants/${current.id}/guide`}><BookOpenCheck/>How it works + print kit</Link><button className="button secondary full" onClick={() => openEditor(current)}>Edit tenant configuration</button></aside></div>
    <div className="tenant-feature-grid"><button onClick={() => openEditor(current)}><School/><h3>Report template</h3><p>{current.reportTemplate}</p><small>Configured</small></button><button onClick={() => openEditor(current)}><FileBadge/><h3>Certificate identity</h3><p>{current.certificateName} / {current.certificateSponsor || "No sponsor"}</p><small>{current.proofSignature}</small></button><button onClick={() => openEditor(current)}><WalletCards/><h3>Marketplace offers</h3><p>{current.marketplaceOfferIds.length} organization-specific offers enabled.</p><small>Manage catalog</small></button></div>
    {draft && <TenantEditor draft={draft} isNew={isNew} onChange={setDraft} onClose={() => setDraft(null)} onSave={save} error={error}/>} 
  </div>;
}

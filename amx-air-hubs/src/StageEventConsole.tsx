import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Copy, DoorOpen, QrCode, Send, ShieldCheck, Sparkles, TicketCheck, Trash2, Users } from "lucide-react";
import { QRCodeCard } from "./components";
import { getActiveTenant } from "./operations";
import { absoluteInviteUrl, createPodInvite, getOwnedPodInvite, resolvePodInvite, revokePodInvite, storeOwnedPodInvite, type PodInvite } from "./pod-invites";
import { STAGE_EVENT_PRESETS, stageEventPreset, type StageEventFormat, type StageEventState, type StageEventStatus, type StageTicketTierId } from "./stage-events";
import type { StageProductionState } from "./stage-production";
import { getTenantRecord } from "./tenant-management";

interface Props {
  room: string;
  event: StageEventState;
  connectedPods: string[];
  generalSeats: number;
  vipSeats: number;
  missionId: string;
  onUpdate: (patch: Partial<Omit<StageProductionState, "revision" | "updatedAt" | "operatorId">>) => void;
}

const STATUSES: Array<{ id: StageEventStatus; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "published", label: "Published" },
  { id: "doors-open", label: "Doors" },
  { id: "live", label: "Live" },
  { id: "complete", label: "Complete" },
];

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function ticketPodId(event: StageEventState, tierId: StageTicketTierId) {
  const date = event.startsAt.slice(0, 10);
  return `${event.id}-${event.format}-${date}-${tierId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64);
}

export function StageEventConsole({ room, event, connectedPods, generalSeats, vipSeats, missionId, onUpdate }: Props) {
  const tenant = useMemo(() => getTenantRecord(getActiveTenant()), []);
  const [selectedTier, setSelectedTier] = useState<StageTicketTierId>("general");
  const [passes, setPasses] = useState<Partial<Record<StageTicketTierId, PodInvite>>>({});
  const [busyTier, setBusyTier] = useState<StageTicketTierId | null>(null);
  const [notice, setNotice] = useState("");
  const preset = stageEventPreset(event.format);
  const activeTier = event.ticketTiers.find((tier) => tier.id === selectedTier) || event.ticketTiers[0];
  const activePass = passes[activeTier.id];

  useEffect(() => {
    let cancelled = false;
    const stored = event.ticketTiers.map((tier) => [tier.id, getOwnedPodInvite(ticketPodId(event, tier.id))] as const);
    setPasses(Object.fromEntries(stored.filter(([, invite]) => invite)));
    stored.forEach(([tierId, invite]) => {
      if (!invite?.token || invite.status !== "active") return;
      void resolvePodInvite(invite.token).then((current) => {
        if (cancelled) return;
        storeOwnedPodInvite(current);
        setPasses((value) => ({ ...value, [tierId]: current }));
      }).catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [event.format, event.id, event.startsAt, event.ticketTiers]);

  const updateEvent = (patch: Partial<StageEventState>) => onUpdate({ event: { ...event, ...patch } });
  const selectFormat = (format: StageEventFormat) => {
    const next = stageEventPreset(format);
    onUpdate({
      event: { ...event, format, venueLayout: next.venueLayout, title: next.defaultTitle, ticketTiers: next.ticketTiers.map((tier) => ({ ...tier })) },
      generalSeats: next.generalSeats,
      vipSeats: next.vipSeats,
      mode: format === "xr-con" ? "metaverse" : "in-person",
    });
    setPasses({});
    setNotice(`${next.label} venue loaded.`);
  };
  const promote = () => {
    const nextStatus = event.status === "draft" ? "published" : event.status;
    onUpdate({
      event: { ...event, status: nextStatus },
      sponsor: { id: event.id, name: event.title, headline: `${preset.label} / ${event.sourceRoom} promoted to stage`, cta: new Date(event.startsAt).toLocaleString(), accent: preset.accent },
      cue: "opening",
      shot: "wide",
    });
    setNotice(`${event.sourceRoom} is promoted into the ${preset.label} venue.`);
  };
  const updateCapacity = (tierId: StageTicketTierId, capacity: number) => updateEvent({
    ticketTiers: event.ticketTiers.map((tier) => tier.id === tierId ? { ...tier, capacity: Math.max(1, Math.min(100, Math.round(capacity) || 1)) } : tier),
  });
  const issuePass = async (tierId: StageTicketTierId) => {
    const tier = event.ticketTiers.find((item) => item.id === tierId);
    if (!tier) return;
    setBusyTier(tierId);
    setNotice("");
    try {
      const hoursUntilEvent = Math.ceil((new Date(event.startsAt).getTime() - Date.now()) / 3_600_000) + 24;
      const invite = await createPodInvite({
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantColor: tenant.color,
        podId: ticketPodId(event, tier.id),
        roomCode: room,
        missionId,
        title: `${event.title} / ${tier.label}`,
        description: `${tier.access}. Admission to ${event.title}, promoted from ${event.sourceRoom}.`,
        hostName: `${tenant.name} Event Team`,
        role: tier.id === "speaker" ? "presenter" : tier.id === "vip" ? "participant" : "viewer",
        maxUses: tier.capacity,
        expiresInHours: Math.max(1, Math.min(168, hoursUntilEvent)),
      });
      setPasses((value) => ({ ...value, [tierId]: invite }));
      setSelectedTier(tierId);
      setNotice(`${tier.label} admission pass issued. The owner key stays on this device.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The admission pass could not be issued.");
    } finally {
      setBusyTier(null);
    }
  };
  const copyPass = async () => {
    if (!activePass) return;
    await navigator.clipboard.writeText(absoluteInviteUrl(activePass));
    setNotice(`${activeTier.label} link copied.`);
  };
  const sharePass = async () => {
    if (!activePass) return;
    const url = absoluteInviteUrl(activePass);
    if (navigator.share) await navigator.share({ title: activePass.title, text: activePass.description, url });
    else await copyPass();
  };
  const revokePass = async () => {
    if (!activePass) return;
    setBusyTier(activeTier.id);
    try {
      await revokePodInvite(activePass.token);
      setPasses((value) => ({ ...value, [activeTier.id]: { ...activePass, status: "revoked" } }));
      setNotice(`${activeTier.label} admission pass revoked.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The admission pass could not be revoked.");
    } finally {
      setBusyTier(null);
    }
  };

  return <div className="stage-event-console">
    <section className="stage-control-section">
      <header><div><span className="eyebrow">EVENT FORMAT</span><h2>Venue preset</h2></div><span className={`stage-event-state ${event.status}`}><i/>{event.status}</span></header>
      <div className="stage-event-formats">{STAGE_EVENT_PRESETS.map((item) => <button key={item.id} className={event.format === item.id ? "active" : ""} onClick={() => selectFormat(item.id)} style={{ "--event-accent": item.accent } as React.CSSProperties}><span>{item.label}</span><small>{item.detail}</small></button>)}</div>
    </section>

    <section className="stage-control-section stage-event-promotion">
      <header><div><span className="eyebrow">PROMOTE ROOM</span><h2>Event identity</h2></div><Sparkles/></header>
      <label>Event name<input value={event.title} maxLength={72} onChange={(change) => updateEvent({ title: change.target.value })}/></label>
      <div className="stage-event-fields"><label>Source room<select value={event.sourceRoom} onChange={(change) => updateEvent({ sourceRoom: change.target.value })}>{[...new Set([event.sourceRoom, ...connectedPods])].map((pod) => <option key={pod}>{pod}</option>)}</select></label><label>Starts<input type="datetime-local" value={localDateTime(event.startsAt)} onChange={(change) => { if (change.target.value) updateEvent({ startsAt: new Date(change.target.value).toISOString() }); }}/></label></div>
      <div className="stage-event-status" aria-label="Event status">{STATUSES.map((status) => <button key={status.id} className={event.status === status.id ? "active" : ""} onClick={() => updateEvent({ status: status.id })}>{status.label}</button>)}</div>
      <button className="stage-promote-button" onClick={promote}><DoorOpen/><span>PROMOTE {event.sourceRoom} TO STAGE</span></button>
    </section>

    <section className="stage-control-section stage-ticket-inventory">
      <header><div><span className="eyebrow">ADMISSION INVENTORY</span><h2>Venue zones and passes</h2></div><span className="stage-seat-total">{generalSeats + vipSeats}</span></header>
      <div className="stage-ticket-table">{event.ticketTiers.map((tier) => {
        const pass = passes[tier.id];
        return <div key={tier.id} className={selectedTier === tier.id ? "selected" : ""}>
          <button className="stage-ticket-tier" onClick={() => setSelectedTier(tier.id)}><span><b>{tier.label}</b><small>{tier.access}</small></span><i className={pass?.status === "active" ? "active" : ""}/></button>
          <label><Users/><input aria-label={`${tier.label} capacity`} type="number" min="1" max="100" value={tier.capacity} onChange={(change) => updateCapacity(tier.id, Number(change.target.value))}/></label>
          <button className="stage-ticket-issue" disabled={busyTier === tier.id || pass?.status === "active"} onClick={() => void issuePass(tier.id)}>{pass?.status === "active" ? <TicketCheck/> : <QrCode/>}<span>{pass?.status === "active" ? `${pass.useCount}/${pass.maxUses}` : "Issue"}</span></button>
        </div>;
      })}</div>
      <p className="stage-ticket-note"><ShieldCheck/>Admission credentials only. Paid checkout is not enabled.</p>
    </section>

    {activePass && <section className="stage-control-section stage-pass-workspace">
      <header><div><span className="eyebrow">{activeTier.label.toUpperCase()} PASS</span><h2>{activePass.status === "active" ? "Ready to share" : activePass.status}</h2></div><span>{activePass.useCount}/{activePass.maxUses}</span></header>
      <QRCodeCard route={activePass.joinPath} title={activePass.title}/>
      <div className="stage-pass-meta"><span><CalendarClock/>Expires {new Date(activePass.expiresAt).toLocaleString()}</span><span><ShieldCheck/>Room is revealed only after acceptance</span></div>
      <div className="stage-pass-actions"><button onClick={() => void copyPass()}><Copy/>Copy</button><button onClick={() => void sharePass()}><Send/>Share</button><button className="danger" disabled={busyTier === activeTier.id || activePass.status !== "active"} onClick={() => void revokePass()} aria-label={`Revoke ${activeTier.label} pass`} title={`Revoke ${activeTier.label} pass`}><Trash2/></button></div>
    </section>}
    {notice && <p className="stage-event-notice" role="status"><TicketCheck/>{notice}</p>}
  </div>;
}

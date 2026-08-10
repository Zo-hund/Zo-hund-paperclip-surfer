import { useEffect, useMemo, useState } from "react";
import { Armchair, Ban, CalendarClock, CheckCircle2, Circle, Clock3, Copy, CreditCard, Crown, DoorOpen, ExternalLink, Eye, Play, QrCode, Send, ShieldCheck, Sparkles, TicketCheck, Trash2, Upload, UserPlus, Users, Video } from "lucide-react";
import { QRCodeCard } from "./components";
import { getActiveTenant } from "./operations";
import { absoluteInviteUrl, createPodInvite, getOwnedInviteZkode, getOwnedPodInvite, resolvePodInvite, revokePodInvite, storeOwnedPodInvite, type PodInvite } from "./pod-invites";
import { createStageSeats, stageSeatCounts, STAGE_EVENT_PRESETS, stageEventPreset, type StageEventFormat, type StageEventState, type StageEventStatus, type StageSeat, type StageSeatSection, type StageSeatStatus, type StageTicketTierId } from "./stage-events";
import type { StageProductionState } from "./stage-production";
import { getTenantRecord } from "./tenant-management";
import { createStageTicketPaymentLink } from "./stage-ticketing";
import { DEFAULT_STAGE_PROGRAM_MEDIA } from "./stage-program-media";

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

const SEAT_STATUSES: Array<{ id: StageSeatStatus; label: string; icon: typeof Circle }> = [
  { id: "open", label: "Open", icon: Circle },
  { id: "held", label: "Hold", icon: Clock3 },
  { id: "reserved", label: "Reserve", icon: Armchair },
  { id: "checked-in", label: "Check in", icon: CheckCircle2 },
  { id: "blocked", label: "Block", icon: Ban },
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
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [selectedSection, setSelectedSection] = useState<StageSeatSection>("house");
  const [selectedSeatId, setSelectedSeatId] = useState(() => event.seats.find((seat) => seat.section === "house")?.id || event.seats[0]?.id || "");
  const [guestDraft, setGuestDraft] = useState("");
  const preset = stageEventPreset(event.format);
  const activeTier = event.ticketTiers.find((tier) => tier.id === selectedTier) || event.ticketTiers[0];
  const activePass = passes[activeTier.id];
  const seatCounts = stageSeatCounts(event.seats);
  const selectedSeat = event.seats.find((seat) => seat.id === selectedSeatId);
  const visibleSeats = event.seats.filter((seat) => seat.section === selectedSection);
  const seatRows = useMemo(() => {
    const rows = new Map<string, StageSeat[]>();
    visibleSeats.forEach((seat) => rows.set(seat.row, [...(rows.get(seat.row) || []), seat]));
    return [...rows.entries()];
  }, [visibleSeats]);

  useEffect(() => {
    if (selectedSeat?.section === selectedSection) return;
    setSelectedSeatId(event.seats.find((seat) => seat.section === selectedSection)?.id || event.seats[0]?.id || "");
  }, [event.seats, selectedSeat?.section, selectedSection]);

  useEffect(() => {
    setGuestDraft(selectedSeat?.guestName || "");
  }, [selectedSeat?.guestName, selectedSeat?.id]);

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
    const seats = createStageSeats(format);
    onUpdate({
      event: { ...event, format, venueLayout: next.venueLayout, title: next.defaultTitle, ticketTiers: next.ticketTiers.map((tier) => ({ ...tier })), seats },
      generalSeats: 0,
      vipSeats: 0,
      mode: format === "xr-con" ? "metaverse" : "in-person",
    });
    setSelectedSection("house");
    setSelectedSeatId(seats.find((seat) => seat.section === "house")?.id || seats[0]?.id || "");
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
  const updateTier = (tierId: StageTicketTierId, patch: Partial<(typeof event.ticketTiers)[number]>) => updateEvent({ ticketTiers: event.ticketTiers.map((tier) => tier.id === tierId ? { ...tier, ...patch } : tier) });
  const connectPayment = async (tierId: StageTicketTierId) => {
    const tier = event.ticketTiers.find((item) => item.id === tierId);
    const pass = passes[tierId];
    if (!tier || !pass) return setNotice("Issue this admission pass before connecting Stripe.");
    if (!tier.priceCents) return setNotice("Set a ticket price before connecting Stripe.");
    setBusyTier(tierId);
    try {
      const checkoutUrl = await createStageTicketPaymentLink({ eventId: event.id, eventTitle: event.title, tierId, tierLabel: tier.label, priceCents: tier.priceCents, capacity: tier.capacity, passPath: pass.joinPath });
      updateTier(tierId, { checkoutUrl });
      setNotice(`${tier.label} is connected to reusable Stripe admission checkout.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Stripe admission checkout could not be created."); }
    finally { setBusyTier(null); }
  };
  const uploadPromo = async (file?: File) => {
    if (!file) return;
    if (!rightsConfirmed) return setNotice("Confirm media rights before uploading promo video.");
    if (!file.type.startsWith("video/") || file.size > 25 * 1024 * 1024) return setNotice("Use an MP4 or WebM promo video up to 25 MB.");
    setMediaBusy(true);
    try {
      const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": file.type, "X-AMX-Filename": file.name, "X-AMX-Tenant": tenant.id, "X-AMX-Media-Purpose": "stage-promo", "X-AMX-Visibility": "public" }, body: file });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Promo upload failed.");
      updateTier(activeTier.id, { promoMediaUrl: body.url, promoMediaName: file.name });
      setNotice(`${file.name} added to ${activeTier.label} promo inventory.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Promo upload failed."); }
    finally { setMediaBusy(false); }
  };
  const takePromo = () => {
    if (!activeTier.promoMediaUrl) return setNotice("Add a promo video first.");
    onUpdate({ programMedia: { ...DEFAULT_STAGE_PROGRAM_MEDIA, url: activeTier.promoMediaUrl, name: activeTier.promoMediaName || `${activeTier.label} promo`, contentType: "video/mp4", transport: "playing", startedAt: Date.now() }, cue: "sponsor" });
    setNotice(`${activeTier.label} promo taken to Stage program.`);
  };
  const updateSeat = (seatId: string, patch: Partial<Pick<StageSeat, "status" | "guestName">>) => {
    const seats = event.seats.map((seat) => seat.id === seatId ? { ...seat, ...patch } : seat);
    const counts = stageSeatCounts(seats);
    onUpdate({ event: { ...event, seats }, generalSeats: counts.checkedInHouse, vipSeats: counts.checkedInVip });
  };
  const setSeatStatus = (status: StageSeatStatus) => {
    if (!selectedSeat) return;
    const guestName = status === "open" || status === "blocked" ? "" : guestDraft.trim().slice(0, 48);
    updateSeat(selectedSeat.id, { status, guestName });
    setNotice(`${selectedSeat.label} is ${status === "checked-in" ? "checked in" : status}.`);
  };
  const saveGuest = () => {
    if (!selectedSeat || selectedSeat.status === "open" || selectedSeat.status === "blocked") return;
    const guestName = guestDraft.trim().slice(0, 48);
    if (guestName === selectedSeat.guestName) return;
    updateSeat(selectedSeat.id, { guestName });
    setNotice(`${selectedSeat.label} guest updated.`);
  };
  const reserveNext = () => {
    const seat = event.seats.find((candidate) => candidate.section === selectedSection && candidate.status === "open");
    if (!seat) {
      setNotice(`No open ${selectedSection} seats remain.`);
      return;
    }
    const guestName = guestDraft.trim().slice(0, 48);
    setSelectedSeatId(seat.id);
    updateSeat(seat.id, { status: "reserved", guestName });
    setNotice(`${seat.label} reserved${guestName ? ` for ${guestName}` : ""}.`);
  };
  const copyViewerLink = async () => {
    await navigator.clipboard.writeText(new URL(`/watch/${room}`, location.origin).toString());
    setNotice("Live viewer link copied.");
  };
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
      <div className="stage-viewer-publish"><a href={`/watch/${room}`} target="_blank" rel="noreferrer"><Eye/><span>OPEN LIVE VIEWER</span><ExternalLink/></a><button onClick={() => void copyViewerLink()} aria-label="Copy live viewer link" title="Copy live viewer link"><Copy/></button></div>
    </section>

    <section className="stage-control-section stage-seat-manager">
      <header><div><span className="eyebrow">EVENT SEAT MANAGER</span><h2>Live venue seating</h2></div><span className="stage-seat-occupancy"><b>{seatCounts.checkedIn}/{seatCounts.capacity}</b><small>checked in</small></span></header>
      <div className="stage-seat-stats" aria-label="Seat inventory summary"><span className="open"><i/><b>{seatCounts.open}</b><small>Open</small></span><span className="held"><i/><b>{seatCounts.held}</b><small>Held</small></span><span className="reserved"><i/><b>{seatCounts.reserved}</b><small>Reserved</small></span><span className="checked-in"><i/><b>{seatCounts.checkedIn}</b><small>In</small></span><span className="blocked"><i/><b>{seatCounts.blocked}</b><small>Blocked</small></span></div>
      <div className="stage-seat-zones" aria-label="Seat section"><button className={selectedSection === "house" ? "active" : ""} onClick={() => setSelectedSection("house")}><Armchair/><span>House</span><b>{event.seats.filter((seat) => seat.section === "house").length}</b></button><button className={selectedSection === "vip" ? "active" : ""} onClick={() => setSelectedSection("vip")}><Crown/><span>VIP / Sponsor</span><b>{event.seats.filter((seat) => seat.section === "vip").length}</b></button></div>
      <div className="stage-seat-map-tool">
        <div className="stage-seat-map-front">AMX XR STAGE</div>
        <div className="stage-seat-rows">{seatRows.map(([row, seats]) => <div className="stage-seat-row" key={row}><b>{row}</b><div>{seats.map((seat) => <button key={seat.id} className={`${seat.status} ${selectedSeatId === seat.id ? "selected" : ""}`} onClick={() => setSelectedSeatId(seat.id)} aria-label={`${seat.label}, ${seat.status}${seat.guestName ? `, ${seat.guestName}` : ""}`} title={`${seat.label} / ${seat.status}${seat.guestName ? ` / ${seat.guestName}` : ""}`}><span>{seat.number}</span></button>)}</div></div>)}</div>
      </div>
      {selectedSeat && <div className="stage-seat-inspector">
        <header><span><b>{selectedSeat.section === "vip" ? "VIP / SPONSOR" : "HOUSE"} {selectedSeat.label}</b><small>{selectedSeat.status.replace("-", " ")}</small></span><i className={selectedSeat.status}/></header>
        <label>Guest / member<input aria-label="Seat guest name" value={guestDraft} maxLength={48} placeholder="Add attendee name" onChange={(change) => setGuestDraft(change.target.value)} onBlur={saveGuest}/></label>
        <div className="stage-seat-actions">{SEAT_STATUSES.map(({ id, label, icon: Icon }) => <button key={id} className={selectedSeat.status === id ? `active ${id}` : id} onClick={() => setSeatStatus(id)} title={`${label} ${selectedSeat.label}`}><Icon/><span>{label}</span></button>)}</div>
        <button className="stage-seat-next" onClick={reserveNext}><UserPlus/><span>RESERVE NEXT {selectedSection.toUpperCase()} SEAT</span></button>
      </div>}
    </section>

    <section className="stage-control-section stage-ticket-inventory">
      <header><div><span className="eyebrow">ADMISSION INVENTORY</span><h2>Venue zones and passes</h2></div><span className="stage-seat-total">{generalSeats + vipSeats}</span></header>
      <div className="stage-ticket-table">{event.ticketTiers.map((tier) => {
        const pass = passes[tier.id];
        return <div key={tier.id} className={selectedTier === tier.id ? "selected" : ""}>
          <button className="stage-ticket-tier" onClick={() => setSelectedTier(tier.id)}><span><b>{tier.label}</b><small>{tier.access}</small></span><i className={pass?.status === "active" ? "active" : ""}/></button>
          <label><Users/><input aria-label={`${tier.label} capacity`} type="number" min="1" max="100" value={tier.capacity} onChange={(change) => updateCapacity(tier.id, Number(change.target.value))}/></label>
          <label><span>$</span><input aria-label={`${tier.label} price`} type="number" min="0" step="1" value={(tier.priceCents || 0) / 100} onChange={(change) => updateEvent({ ticketTiers: event.ticketTiers.map((item) => item.id === tier.id ? { ...item, priceCents: Math.round(Math.max(0, Number(change.target.value)) * 100) } : item) })}/></label>
          <button className="stage-ticket-issue" disabled={busyTier === tier.id || pass?.status === "active"} onClick={() => void issuePass(tier.id)}>{pass?.status === "active" ? <TicketCheck/> : <QrCode/>}<span>{pass?.status === "active" ? `${pass.useCount}/${pass.maxUses}` : "Issue"}</span></button>
          <input className="stage-ticket-checkout" aria-label={`${tier.label} checkout URL`} value={tier.checkoutUrl || ""} placeholder="HTTPS CHECKOUT LINK" onChange={(change) => updateEvent({ ticketTiers: event.ticketTiers.map((item) => item.id === tier.id ? { ...item, checkoutUrl: change.target.value } : item) })}/>
          <input className="stage-ticket-resources" aria-label={`${tier.label} resource URLs`} value={(tier.resourceUrls || []).join(", ")} placeholder="RESOURCE LINKS, COMMA SEPARATED" onChange={(change) => updateEvent({ ticketTiers: event.ticketTiers.map((item) => item.id === tier.id ? { ...item, resourceUrls: change.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 8) } : item) })}/>
          <button className="stage-ticket-stripe" disabled={busyTier === tier.id || !pass || !(tier.priceCents || 0)} onClick={() => void connectPayment(tier.id)}><CreditCard/><span>{tier.checkoutUrl ? "Stripe linked" : "Connect Stripe"}</span></button>
        </div>;
      })}</div>
      <p className="stage-ticket-note"><ShieldCheck/>Checkout links open your payment provider. Paid downloads remain hidden until fulfillment.</p>
      <div className="stage-ticket-promo">
        <header><span><Video/><b>{activeTier.label} promo / ad asset</b></span><small>{activeTier.promoMediaUrl ? "READY" : "PLACEHOLDER"}</small></header>
        {activeTier.promoMediaUrl ? <video src={activeTier.promoMediaUrl} muted playsInline controls preload="metadata"/> : <div className="stage-ticket-promo-empty"><Video/><span>Add a short event trailer, sponsor spot, or admission promo.</span></div>}
        <input value={activeTier.promoMediaUrl || ""} placeholder="HTTPS MP4 OR WEBM URL" onChange={(change) => updateTier(activeTier.id, { promoMediaUrl: change.target.value, promoMediaName: change.target.value.split("/").pop() || "Promo asset" })}/>
        <div><label className={rightsConfirmed ? "confirmed" : ""}><input type="checkbox" checked={rightsConfirmed} onChange={(change) => setRightsConfirmed(change.target.checked)}/><ShieldCheck/>RIGHTS CLEARED</label><label className={`button secondary ${!rightsConfirmed || mediaBusy ? "disabled" : ""}`}><Upload/>{mediaBusy ? "Uploading" : "Upload video"}<input hidden type="file" accept="video/mp4,video/webm" disabled={!rightsConfirmed || mediaBusy} onChange={(change) => { const file=change.target.files?.[0]; change.target.value=""; void uploadPromo(file); }}/></label><button className="button primary" disabled={!activeTier.promoMediaUrl} onClick={takePromo}><Play/>Take to Stage</button></div>
      </div>
    </section>

    {activePass && <section className="stage-control-section stage-pass-workspace">
      <header><div><span className="eyebrow">{activeTier.label.toUpperCase()} PASS</span><h2>{activePass.status === "active" ? "Ready to share" : activePass.status}</h2></div><span>{activePass.useCount}/{activePass.maxUses}</span></header>
      <QRCodeCard route={activePass.joinPath} title={activePass.title}/>
      <div className="stage-pass-meta"><span><CalendarClock/>Expires {new Date(activePass.expiresAt).toLocaleString()}</span><span><ShieldCheck/>QR + ZKODE unlock required</span><code>ZKODE: {getOwnedInviteZkode(activePass.token)||"LEGACY PASS - REISSUE"}</code></div>
      <div className="stage-pass-actions"><button onClick={() => void copyPass()}><Copy/>Copy</button><button onClick={() => void sharePass()}><Send/>Share</button><button className="danger" disabled={busyTier === activeTier.id || activePass.status !== "active"} onClick={() => void revokePass()} aria-label={`Revoke ${activeTier.label} pass`} title={`Revoke ${activeTier.label} pass`}><Trash2/></button></div>
    </section>}
    {notice && <p className="stage-event-notice" role="status"><TicketCheck/>{notice}</p>}
  </div>;
}

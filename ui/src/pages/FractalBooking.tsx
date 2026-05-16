import * as React from "react";
import { useState, useRef } from "react";
import {
  User, Users, Layers, Globe, MapPin, Orbit,
  DollarSign, Bitcoin, Sun, Cloud, Sunset, Moon,
  CheckCircle2, ChevronRight, Zap, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/PublicLayout";
import { Link } from "@/lib/router";
import { useNavigate } from "react-router-dom";
import { MicroServiceBooking } from "@/components/MicroServiceBooking";

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionType = "solo" | "coop" | "team";
type ParticipantMode = "human" | "agent" | "hybrid";
type DeliveryFormat = "in-person" | "online" | "metaverse";
type PaymentMode = "fiat" | "crypto";
type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri";
type TimeSlot = "morning" | "afternoon" | "evening" | "night";

interface SlotInfo {
  day: DayOfWeek;
  slot: TimeSlot;
  sessionType: SessionType;
  participantMode: ParticipantMode;
  deliveryFormat: DeliveryFormat;
  booked: number;
  capacity: number;
  priceLabel: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const SESSION_TYPES = [
  {
    id: "solo" as SessionType,
    label: "Solo",
    subtitle: "Individual Focus",
    description: "One-on-one session with a dedicated agent or human expert. Deep-focus work, precise outputs, full attention on your task.",
    icon: User,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    activeBorder: "border-blue-400",
    price: "From 25 cr/hr",
    modes: ["Human", "Agent", "Hybrid"],
  },
  {
    id: "coop" as SessionType,
    label: "Co-op",
    subtitle: "Small Group Sync",
    description: "2–4 participants working together with AI scaffolding. Great for design sprints, strategy sessions, and cross-functional runs.",
    icon: Users,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    activeBorder: "border-violet-400",
    price: "From 200 cr/hr",
    modes: ["Human", "Hybrid"],
  },
  {
    id: "team" as SessionType,
    label: "Team",
    subtitle: "Full Squad Deploy",
    description: "Full team execution with 5–12 agents and humans. Coordinated runs with role assignments, deliverable packaging, and HITL gates.",
    icon: Layers,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    activeBorder: "border-amber-400",
    price: "From 800 cr/hr",
    modes: ["Human", "Agent", "Hybrid"],
  },
] as const;

const PARTICIPANT_OPTIONS = [
  { id: "human" as ParticipantMode,  label: "Human",  icon: User,  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { id: "agent" as ParticipantMode,  label: "Agent",  icon: Zap,   color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30"    },
  { id: "hybrid" as ParticipantMode, label: "Hybrid", icon: Users, color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30"  },
];

const DELIVERY_OPTIONS = [
  { id: "in-person" as DeliveryFormat, label: "In-Person",     icon: MapPin, color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30"  },
  { id: "online" as DeliveryFormat,    label: "Online",         icon: Globe,  color: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/30"    },
  { id: "metaverse" as DeliveryFormat, label: "Metaverse / XR", icon: Orbit,  color: "text-rose-400",   bg: "bg-rose-500/10",   border: "border-rose-500/30"   },
];

const DAYS: { id: DayOfWeek; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
];

const TIME_SLOTS: { id: TimeSlot; label: string; range: string; icon: typeof Sun }[] = [
  { id: "morning",   label: "Morning",   range: "9:00 AM – 12:00 PM", icon: Sun    },
  { id: "afternoon", label: "Afternoon", range: "1:00 PM – 4:00 PM",  icon: Cloud  },
  { id: "evening",   label: "Evening",   range: "5:00 PM – 8:00 PM",  icon: Sunset },
  { id: "night",     label: "Night",     range: "9:00 PM – 12:00 AM", icon: Moon   },
];

const SLOT_EMOJIS: Record<TimeSlot, string> = {
  morning: "☀️",
  afternoon: "🌤️",
  evening: "🌆",
  night: "🌙",
};

// Static schedule — realistic mix across the week
const SCHEDULE: SlotInfo[] = [
  // Monday
  { day: "mon", slot: "morning",   sessionType: "solo",  participantMode: "agent",  deliveryFormat: "online",    booked: 3, capacity: 8,  priceLabel: "35 cr/hr" },
  { day: "mon", slot: "afternoon", sessionType: "coop",  participantMode: "hybrid", deliveryFormat: "in-person", booked: 1, capacity: 4,  priceLabel: "220 cr/hr" },
  { day: "mon", slot: "evening",   sessionType: "solo",  participantMode: "human",  deliveryFormat: "online",    booked: 2, capacity: 6,  priceLabel: "550 cr/hr" },
  { day: "mon", slot: "night",     sessionType: "team",  participantMode: "agent",  deliveryFormat: "online",    booked: 0, capacity: 12, priceLabel: "900 cr/hr" },
  // Tuesday
  { day: "tue", slot: "morning",   sessionType: "coop",  participantMode: "hybrid", deliveryFormat: "online",    booked: 2, capacity: 4,  priceLabel: "200 cr/hr" },
  { day: "tue", slot: "afternoon", sessionType: "solo",  participantMode: "agent",  deliveryFormat: "online",    booked: 5, capacity: 8,  priceLabel: "35 cr/hr" },
  { day: "tue", slot: "evening",   sessionType: "team",  participantMode: "hybrid", deliveryFormat: "in-person", booked: 3, capacity: 10, priceLabel: "850 cr/hr" },
  { day: "tue", slot: "night",     sessionType: "solo",  participantMode: "agent",  deliveryFormat: "metaverse", booked: 1, capacity: 6,  priceLabel: "45 cr/hr" },
  // Wednesday
  { day: "wed", slot: "morning",   sessionType: "team",  participantMode: "hybrid", deliveryFormat: "in-person", booked: 5, capacity: 12, priceLabel: "1,000 cr/hr" },
  { day: "wed", slot: "afternoon", sessionType: "solo",  participantMode: "human",  deliveryFormat: "online",    booked: 0, capacity: 6,  priceLabel: "600 cr/hr" },
  { day: "wed", slot: "evening",   sessionType: "coop",  participantMode: "agent",  deliveryFormat: "online",    booked: 2, capacity: 4,  priceLabel: "210 cr/hr" },
  { day: "wed", slot: "night",     sessionType: "solo",  participantMode: "agent",  deliveryFormat: "metaverse", booked: 0, capacity: 8,  priceLabel: "40 cr/hr" },
  // Thursday
  { day: "thu", slot: "morning",   sessionType: "solo",  participantMode: "agent",  deliveryFormat: "online",    booked: 4, capacity: 8,  priceLabel: "35 cr/hr" },
  { day: "thu", slot: "afternoon", sessionType: "coop",  participantMode: "hybrid", deliveryFormat: "online",    booked: 3, capacity: 4,  priceLabel: "230 cr/hr" },
  { day: "thu", slot: "evening",   sessionType: "solo",  participantMode: "agent",  deliveryFormat: "metaverse", booked: 1, capacity: 6,  priceLabel: "50 cr/hr" },
  { day: "thu", slot: "night",     sessionType: "team",  participantMode: "hybrid", deliveryFormat: "metaverse", booked: 2, capacity: 10, priceLabel: "950 cr/hr" },
  // Friday
  { day: "fri", slot: "morning",   sessionType: "coop",  participantMode: "agent",  deliveryFormat: "online",    booked: 1, capacity: 4,  priceLabel: "195 cr/hr" },
  { day: "fri", slot: "afternoon", sessionType: "team",  participantMode: "hybrid", deliveryFormat: "online",    booked: 7, capacity: 12, priceLabel: "820 cr/hr" },
  { day: "fri", slot: "evening",   sessionType: "solo",  participantMode: "human",  deliveryFormat: "metaverse", booked: 0, capacity: 6,  priceLabel: "650 cr/hr" },
  { day: "fri", slot: "night",     sessionType: "team",  participantMode: "agent",  deliveryFormat: "metaverse", booked: 3, capacity: 10, priceLabel: "880 cr/hr" },
];

// ── SlotCard ──────────────────────────────────────────────────────────────────

function SlotCard({ slot, onBook }: { slot: SlotInfo; onBook: (s: SlotInfo) => void }) {
  const sessionDef  = SESSION_TYPES.find((s) => s.id === slot.sessionType)!;
  const timeSlotDef = TIME_SLOTS.find((t) => t.id === slot.slot)!;
  const delivDef    = DELIVERY_OPTIONS.find((d) => d.id === slot.deliveryFormat)!;
  const partDef     = PARTICIPANT_OPTIONS.find((p) => p.id === slot.participantMode)!;
  const open        = slot.capacity - slot.booked;
  const full        = open === 0;

  return (
    <div className={`rounded-2xl border bg-card/50 p-3 flex flex-col gap-2.5 transition-all hover:border-primary/40 hover:bg-accent/5 ${full ? "opacity-50 pointer-events-none" : "border-border/40"}`}>
      {/* Time header */}
      <div className="flex items-center gap-1.5">
        <span className="text-[13px]">{SLOT_EMOJIS[slot.slot]}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{timeSlotDef.label}</span>
        {full && (
          <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-destructive/80 border border-destructive/30 rounded px-1 py-0.5">Full</span>
        )}
      </div>

      {/* Time range */}
      <p className="text-[11px] font-bold text-foreground/70">{timeSlotDef.range}</p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1">
        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${sessionDef.bg} ${sessionDef.color} border ${sessionDef.border}`}>
          {sessionDef.label}
        </span>
        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${partDef.bg} ${partDef.color} border ${partDef.border}`}>
          {partDef.label}
        </span>
        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${delivDef.bg} ${delivDef.color} border ${delivDef.border}`}>
          {delivDef.label}
        </span>
      </div>

      {/* Availability bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-muted-foreground">{slot.booked}/{slot.capacity} booked</span>
          <span className="text-[9px] font-black text-primary">{slot.priceLabel}</span>
        </div>
        <div className="h-1 rounded-full bg-border/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${full ? "bg-destructive/50" : "bg-primary/60"}`}
            style={{ width: `${(slot.booked / slot.capacity) * 100}%` }}
          />
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => onBook(slot)}
        className="w-full font-black text-[10px] uppercase tracking-widest h-7 mt-auto border-primary/30 hover:bg-primary/10 hover:text-primary"
      >
        Book Slot
      </Button>
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({
  active, color, bg, border, icon: Icon, label, onClick,
}: {
  active: boolean; color: string; bg: string; border: string;
  icon: React.ElementType; label: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
        active ? `${bg} ${color} ${border}` : "border-border/30 text-muted-foreground hover:border-border/60"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
      {active && <CheckCircle2 className="h-3 w-3 ml-0.5" />}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function FractalBooking() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<SessionType | null>(null);
  const [participants, setParticipants] = useState<ParticipantMode[]>(["human", "agent", "hybrid"]);
  const [delivery, setDelivery] = useState<DeliveryFormat>("online");
  const [payment, setPayment] = useState<PaymentMode>("fiat");
  const [bookingSlot, setBookingSlot] = useState<SlotInfo | null>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);

  const toggleParticipant = (mode: ParticipantMode) => {
    setParticipants((prev) =>
      prev.includes(mode)
        ? prev.length > 1 ? prev.filter((p) => p !== mode) : prev
        : [...prev, mode]
    );
  };

  const filteredSlots = SCHEDULE.filter((s) => {
    if (selectedType && s.sessionType !== selectedType) return false;
    if (!participants.includes(s.participantMode)) return false;
    if (s.deliveryFormat !== delivery) return false;
    return true;
  });

  const scrollToSchedule = () => {
    scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelectType = (type: SessionType) => {
    setSelectedType((prev) => (prev === type ? null : type));
    setTimeout(scrollToSchedule, 100);
  };

  // Build instruction string for micro-booking modal
  const bookingInstruction = bookingSlot
    ? `[AMX Fractal Session] ${bookingSlot.sessionType.toUpperCase()} · ${SLOT_EMOJIS[bookingSlot.slot]} ${bookingSlot.slot} · ${bookingSlot.day.toUpperCase()} · ${bookingSlot.deliveryFormat} · ${bookingSlot.participantMode} · ${bookingSlot.priceLabel} · Payment: ${payment}`
    : "";

  return (
    <PublicLayout>
      <div className="min-h-screen bg-background text-foreground">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border/20 bg-gradient-to-b from-primary/5 via-background to-background">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-20 md:py-28 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 mb-8">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Mon – Fri · 4 Time Blocks Daily</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight text-foreground mb-4 leading-none">
              AMX FRACTAL<br />
              <span className="text-primary">SESSIONS</span>
            </h1>
            <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
              Modular · Scalable · Human-Agent Hybrid
            </p>
            <p className="max-w-lg mx-auto text-sm text-muted-foreground mb-10">
              Book flexible micro-sessions for Solo focus, Co-op collaboration, or full Team deployments.
              Human, Agent, or Hybrid participants. Fiat or Crypto via the Skill Marketplace.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Button
                onClick={scrollToSchedule}
                variant="outline"
                className="font-black text-[11px] uppercase tracking-widest gap-2 h-11 px-6"
              >
                View Complete Schedule <ChevronRight className="h-4 w-4" />
              </Button>
              <Link to="/request">
                <Button className="font-black text-[11px] uppercase tracking-widest gap-2 h-11 px-6 shadow-lg shadow-primary/20">
                  Get Involved Today <Zap className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Decorative glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
            <div className="h-96 w-96 rounded-full bg-primary blur-3xl" />
          </div>
        </section>

        {/* ── Session Type Cards ─────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-16">
          <div className="text-center mb-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Choose Your Format</p>
            <h2 className="text-2xl font-black tracking-tight">Session Types</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SESSION_TYPES.map((type) => {
              const Icon = type.icon;
              const active = selectedType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => handleSelectType(type.id)}
                  className={`text-left p-6 rounded-3xl border transition-all duration-200 ${
                    active
                      ? `${type.bg} ${type.activeBorder} shadow-lg`
                      : `bg-card/50 border-border/40 hover:border-primary/30 hover:bg-accent/5`
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${type.bg} border ${type.border}`}>
                    <Icon className={`h-6 w-6 ${type.color}`} />
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-base font-black text-foreground">{type.label}</p>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${type.color}`}>{type.subtitle}</p>
                    </div>
                    {active && <CheckCircle2 className={`h-5 w-5 ${type.color} mt-0.5`} />}
                  </div>
                  <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">{type.description}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-black ${type.color}`}>{type.price}</span>
                    <div className="flex gap-1">
                      {type.modes.map((m) => (
                        <span key={m} className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-background/50 border border-border/30 text-muted-foreground">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Filter Bar ────────────────────────────────────────────────────── */}
        <div ref={scheduleRef} className="sticky top-16 z-30 bg-background/95 backdrop-blur-md border-y border-border/30">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-4">

            {/* Participant */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Participant</span>
              {PARTICIPANT_OPTIONS.map((p) => (
                <FilterChip
                  key={p.id}
                  active={participants.includes(p.id)}
                  color={p.color}
                  bg={p.bg}
                  border={p.border}
                  icon={p.icon}
                  label={p.label}
                  onClick={() => toggleParticipant(p.id)}
                />
              ))}
            </div>

            <div className="h-6 w-px bg-border/30 hidden md:block" />

            {/* Delivery */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Format</span>
              {DELIVERY_OPTIONS.map((d) => (
                <FilterChip
                  key={d.id}
                  active={delivery === d.id}
                  color={d.color}
                  bg={d.bg}
                  border={d.border}
                  icon={d.icon}
                  label={d.label}
                  onClick={() => setDelivery(d.id)}
                />
              ))}
            </div>

            <div className="h-6 w-px bg-border/30 hidden md:block" />

            {/* Payment */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Pay</span>
              <FilterChip
                active={payment === "fiat"}
                color="text-emerald-400"
                bg="bg-emerald-500/10"
                border="border-emerald-500/30"
                icon={DollarSign}
                label="Fiat"
                onClick={() => setPayment("fiat")}
              />
              <FilterChip
                active={payment === "crypto"}
                color="text-amber-400"
                bg="bg-amber-500/10"
                border="border-amber-500/30"
                icon={Bitcoin}
                label="Crypto"
                onClick={() => setPayment("crypto")}
              />
            </div>
          </div>
        </div>

        {/* ── Schedule Grid ─────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-12">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Weekly Schedule</p>
              <h2 className="text-xl font-black tracking-tight">
                {selectedType ? `${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Sessions` : "All Sessions"}
                {" "}
                <span className="text-muted-foreground font-medium text-base">— {filteredSlots.length} available</span>
              </h2>
            </div>
            {selectedType && (
              <button
                onClick={() => setSelectedType(null)}
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border/30 rounded-lg px-3 py-1.5 transition-colors"
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-5 gap-3 mb-3">
            {DAYS.map((d) => (
              <div key={d.id} className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground py-1">
                {d.label}
              </div>
            ))}
          </div>

          {/* Rows by time slot */}
          <div className="space-y-6">
            {TIME_SLOTS.map((timeSlot) => {
              const SlotIcon = timeSlot.icon;
              return (
                <div key={timeSlot.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <SlotIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {SLOT_EMOJIS[timeSlot.id]} {timeSlot.label} · {timeSlot.range}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    {DAYS.map((day) => {
                      const slot = filteredSlots.find((s) => s.day === day.id && s.slot === timeSlot.id);
                      if (!slot) {
                        return (
                          <div
                            key={day.id}
                            className="rounded-2xl border border-dashed border-border/20 bg-card/20 p-3 flex items-center justify-center min-h-[140px]"
                          >
                            <span className="text-[9px] text-muted-foreground/40 font-bold uppercase tracking-widest text-center">No match</span>
                          </div>
                        );
                      }
                      return <SlotCard key={`${day.id}-${timeSlot.id}`} slot={slot} onBook={setBookingSlot} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── CTA Strip ─────────────────────────────────────────────────────── */}
        <section className="border-t border-border/20 bg-gradient-to-b from-primary/5 to-background">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-16 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Skill Marketplace · Fiat & Crypto Accepted</p>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-4">Ready to lock in your session?</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-10">
              Sessions fill fast. Book your slot above or submit a full service request for custom scoping and scheduling.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Button
                onClick={scrollToSchedule}
                variant="outline"
                className="font-black text-[11px] uppercase tracking-widest gap-2 h-11 px-6"
              >
                View Complete Schedule <Calendar className="h-4 w-4" />
              </Button>
              <Link to="/request">
                <Button className="font-black text-[11px] uppercase tracking-widest gap-2 h-11 px-6 shadow-lg shadow-primary/20">
                  Get Involved Today <Zap className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

      </div>

      {/* ── Booking modal ─────────────────────────────────────────────────── */}
      <MicroServiceBooking
        open={!!bookingSlot}
        onClose={() => setBookingSlot(null)}
        defaultTaskType="custom"
        defaultUrl=""
        onBooked={(result) => {
          setBookingSlot(null);
          if (result.issueIdentifier) navigate(`/track/${result.issueIdentifier}`);
        }}
      />
      {/* Pre-fill instruction once modal opens */}
      {bookingSlot && (
        <input type="hidden" data-booking-instruction={bookingInstruction} />
      )}
    </PublicLayout>
  );
}

import { useMemo, useState } from "react";
import { cn } from "../lib/utils";

type FormatId = "in-person" | "online" | "metaverse";

const SLOTS = [
  { id: "morning", label: "Morning", icon: "☀️", time: "9 AM – 12 PM" },
  { id: "afternoon", label: "Afternoon", icon: "🌤️", time: "1 PM – 4 PM" },
  { id: "evening", label: "Evening", icon: "🌆", time: "5 PM – 8 PM" },
  { id: "night", label: "Night", icon: "🌙", time: "9 PM – 12 AM" },
] as const;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const FORMATS: Array<{ id: FormatId; label: string; icon: string; subtitle: string }> = [
  { id: "in-person", label: "In-Person", icon: "🏢", subtitle: "On-site team training" },
  { id: "online", label: "Online", icon: "💻", subtitle: "Virtual team sessions" },
  { id: "metaverse", label: "Metaverse", icon: "🥽", subtitle: "Immersive XR training" },
];

function slotKey(day: string, slot: string) {
  return `${day.toLowerCase()}-${slot}`;
}

export function AgentBookingSchedule({ agentId }: { agentId: string }) {
  const [selectedFormat, setSelectedFormat] = useState<FormatId>("online");
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());

  const toggleSlot = (day: string, slotId: string) => {
    const key = slotKey(day, slotId);
    setBookedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedCount = bookedSlots.size;

  const formatHelp = useMemo(
    () => FORMATS.find((f) => f.id === selectedFormat)?.subtitle ?? "",
    [selectedFormat],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Team Booking Schedule</h2>
        <p className="text-sm text-muted-foreground">
          Flexible team sessions — Monday through Friday across four daily time slots.
        </p>
      </div>

      {/* Format selector */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FORMATS.map((f) => {
          const active = f.id === selectedFormat;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFormat(f.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border bg-card p-4 text-left transition-colors",
                active
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-border hover:border-primary/40",
              )}
            >
              <span className="text-2xl leading-none">{f.icon}</span>
              <span className="text-sm font-medium">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.subtitle}</span>
            </button>
          );
        })}
      </div>

      {/* Time-slot grid */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">This week</div>
          <div className="text-xs text-muted-foreground">{formatHelp}</div>
        </div>

        <div className="overflow-x-auto">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `120px repeat(${DAYS.length}, minmax(120px, 1fr))` }}
          >
            {/* Header row */}
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}

            {/* Slot rows */}
            {SLOTS.map((slot) => (
              <>
                <div key={`${slot.id}-label`} className="flex flex-col justify-center pr-2">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <span aria-hidden>{slot.icon}</span> {slot.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{slot.time}</span>
                  <span className="text-[10px] text-muted-foreground">3-hour sessions</span>
                </div>
                {DAYS.map((day) => {
                  const key = slotKey(day, slot.id);
                  const booked = bookedSlots.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSlot(day, slot.id)}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-md border px-2 py-3 text-xs transition-colors",
                        booked
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:border-primary/40",
                      )}
                      aria-pressed={booked}
                    >
                      <span className="font-medium">{booked ? "Booked" : "Available"}</span>
                    </button>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="text-sm">
          <div className="font-medium">
            {selectedCount === 0
              ? "No slots selected"
              : `${selectedCount} slot${selectedCount === 1 ? "" : "s"} selected`}
          </div>
          <div className="text-xs text-muted-foreground">
            Format: {FORMATS.find((f) => f.id === selectedFormat)?.label}
          </div>
        </div>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => {
            // TODO: wire to booking persistence API in follow-up
            // eslint-disable-next-line no-console
            console.log("[AgentBookingSchedule] book", {
              agentId,
              format: selectedFormat,
              slots: Array.from(bookedSlots),
            });
          }}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            selectedCount === 0
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          Book Selected Slots
        </button>
      </div>
    </div>
  );
}

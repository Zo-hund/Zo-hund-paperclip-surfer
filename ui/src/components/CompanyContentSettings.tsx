import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assetsApi } from "../api/assets";
import { companyContentApi, type CompanyStaffRow, type CompanyEventRow } from "../api/company-content";
import { Field } from "./agent-config-primitives";

function toDateInputValue(iso: string | undefined) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

// ── Staff card ────────────────────────────────────────────────────────────────

function StaffCard({
  member,
  companyId,
  onDelete,
}: {
  member: CompanyStaffRow;
  companyId: string;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: member.name, title: member.title });
  const dirty = form.name !== member.name || form.title !== member.title;

  const update = useMutation({
    mutationFn: (data: Partial<CompanyStaffRow>) =>
      companyContentApi.updateStaff(companyId, member.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-staff", companyId] }),
  });

  async function handlePhoto(file: File) {
    const asset = await assetsApi.uploadImage(companyId, file, "staff-photos");
    update.mutate({ photoAssetId: asset.assetId });
  }

  return (
    <div className="space-y-2 rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[10rem] space-y-1">
          <label className="text-xs text-muted-foreground">Name</label>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="flex-1 min-w-[12rem] space-y-1">
          <label className="text-xs text-muted-foreground">Title</label>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
      </div>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePhoto(file);
        }}
      />
      {member.photoAssetId && (
        <span className="text-[11px] text-muted-foreground">Photo set ✓</span>
      )}
      <div className="flex items-center justify-between pt-1">
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
        <Button
          size="sm"
          onClick={() => update.mutate(form)}
          disabled={update.isPending || !dirty}
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

type EventForm = {
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  timeRange: string;
  ageRange: string;
  description: string;
  registrationUrl: string;
};

function eventToForm(event: CompanyEventRow): EventForm {
  return {
    title: event.title,
    subtitle: event.subtitle ?? "",
    startDate: toDateInputValue(event.startDate),
    endDate: toDateInputValue(event.endDate),
    timeRange: event.timeRange ?? "",
    ageRange: event.ageRange ?? "",
    description: event.description ?? "",
    registrationUrl: event.registrationUrl ?? "",
  };
}

function EventCard({
  event,
  companyId,
  onDelete,
}: {
  event: CompanyEventRow;
  companyId: string;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EventForm>(() => eventToForm(event));
  const initial = eventToForm(event);
  const dirty = (Object.keys(form) as (keyof EventForm)[]).some((k) => form[k] !== initial[k]);

  const update = useMutation({
    mutationFn: (data: Partial<CompanyEventRow>) =>
      companyContentApi.updateEvent(companyId, event.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-events", companyId] }),
  });

  async function handleFlyer(file: File) {
    const asset = await assetsApi.uploadImage(companyId, file, "events");
    update.mutate({ flyerAssetId: asset.assetId } as Partial<CompanyEventRow>);
  }

  function handleSave() {
    update.mutate({
      title: form.title,
      subtitle: form.subtitle || null,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      timeRange: form.timeRange || null,
      ageRange: form.ageRange || null,
      description: form.description || null,
      registrationUrl: form.registrationUrl || null,
    } as Partial<CompanyEventRow>);
  }

  const set = (key: keyof EventForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-3 rounded-md border border-border px-4 py-4">
      <Field label="Title">
        <input
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          value={form.title}
          onChange={set("title")}
        />
      </Field>
      <Field label="Subtitle">
        <input
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          value={form.subtitle}
          onChange={set("subtitle")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start date">
          <input
            type="date"
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={form.startDate}
            onChange={set("startDate")}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={form.endDate}
            onChange={set("endDate")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Time range" hint='e.g. "6:00 — 8:00 PM Nightly"'>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={form.timeRange}
            onChange={set("timeRange")}
          />
        </Field>
        <Field label="Age range" hint='e.g. "Pre-K — 12th Grade"'>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={form.ageRange}
            onChange={set("ageRange")}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          rows={3}
          value={form.description}
          onChange={set("description")}
        />
      </Field>
      <Field
        label="Registration URL"
        hint="A QR code linking here is generated automatically when saved."
      >
        <input
          type="url"
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          value={form.registrationUrl}
          onChange={set("registrationUrl")}
        />
      </Field>
      {event.qrCodeAssetId && (
        <span className="text-[11px] text-muted-foreground">QR code generated ✓</span>
      )}
      <Field label="Flyer image">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFlyer(file);
          }}
        />
      </Field>
      {event.flyerAssetId && (
        <span className="text-[11px] text-muted-foreground">Flyer set ✓</span>
      )}
      <div className="flex items-center justify-between pt-1">
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
        <Button size="sm" onClick={handleSave} disabled={update.isPending || !dirty}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ── Parent panel ──────────────────────────────────────────────────────────────

export function CompanyContentSettings({ companyId, issuePrefix }: { companyId: string; issuePrefix: string }) {
  const queryClient = useQueryClient();

  const staffQuery = useQuery({
    queryKey: ["company-staff", companyId],
    queryFn: () => companyContentApi.listStaff(companyId),
  });
  const eventsQuery = useQuery({
    queryKey: ["company-events", companyId],
    queryFn: () => companyContentApi.listEvents(companyId),
  });

  const addStaffMutation = useMutation({
    mutationFn: () =>
      companyContentApi.createStaff(companyId, {
        name: "New staff member",
        title: "Title",
        sortOrder: staffQuery.data?.length ?? 0,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-staff", companyId] }),
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (staffId: string) => companyContentApi.deleteStaff(companyId, staffId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-staff", companyId] }),
  });

  const addEventMutation = useMutation({
    mutationFn: () => {
      const now = new Date();
      const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return companyContentApi.createEvent(companyId, {
        title: "New event",
        startDate: now.toISOString(),
        endDate: inAWeek.toISOString(),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-events", companyId] }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => companyContentApi.deleteEvent(companyId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-events", companyId] }),
  });

  return (
    <>
      {/* Staff */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Staff (public page)
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addStaffMutation.mutate()}
            disabled={addStaffMutation.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add staff
          </Button>
        </div>
        <div className="space-y-3">
          {(staffQuery.data ?? []).map((member) => (
            <StaffCard
              key={member.id}
              member={member}
              companyId={companyId}
              onDelete={() => deleteStaffMutation.mutate(member.id)}
            />
          ))}
          {staffQuery.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">No staff members yet.</p>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Events / flyers (public page)
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addEventMutation.mutate()}
            disabled={addEventMutation.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add event
          </Button>
        </div>
        <div className="space-y-4">
          {(eventsQuery.data ?? []).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              companyId={companyId}
              onDelete={() => deleteEventMutation.mutate(event.id)}
            />
          ))}
          {eventsQuery.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">No events yet.</p>
          )}
        </div>
      </div>

      <a
        href={`/c/${issuePrefix}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> View public page
      </a>
    </>
  );
}

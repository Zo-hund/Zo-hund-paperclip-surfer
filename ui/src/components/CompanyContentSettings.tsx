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

  const updateStaffMutation = useMutation({
    mutationFn: ({ staffId, data }: { staffId: string; data: Partial<CompanyStaffRow> }) =>
      companyContentApi.updateStaff(companyId, staffId, data),
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

  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Partial<CompanyEventRow> }) =>
      companyContentApi.updateEvent(companyId, eventId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-events", companyId] }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => companyContentApi.deleteEvent(companyId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-events", companyId] }),
  });

  async function handleStaffPhoto(staffId: string, file: File) {
    const asset = await assetsApi.uploadImage(companyId, file, "staff-photos");
    updateStaffMutation.mutate({ staffId, data: { photoAssetId: asset.assetId } });
  }

  async function handleFlyerUpload(eventId: string, file: File) {
    const asset = await assetsApi.uploadImage(companyId, file, "events");
    updateEventMutation.mutate({ eventId, data: { flyerAssetId: asset.assetId } as Partial<CompanyEventRow> });
  }

  return (
    <>
      {/* Staff */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Staff (public page)
          </div>
          <Button size="sm" variant="outline" onClick={() => addStaffMutation.mutate()} disabled={addStaffMutation.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add staff
          </Button>
        </div>
        <div className="space-y-3">
          {(staffQuery.data ?? []).map((member) => (
            <div key={member.id} className="space-y-2 rounded-md border border-border px-4 py-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[10rem] space-y-1">
                  <label className="text-xs text-muted-foreground">Name</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={member.name}
                    onBlur={(e) => {
                      if (e.target.value !== member.name) {
                        updateStaffMutation.mutate({ staffId: member.id, data: { name: e.target.value } });
                      }
                    }}
                  />
                </div>
                <div className="flex-1 min-w-[12rem] space-y-1">
                  <label className="text-xs text-muted-foreground">Title</label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={member.title}
                    onBlur={(e) => {
                      if (e.target.value !== member.title) {
                        updateStaffMutation.mutate({ staffId: member.id, data: { title: e.target.value } });
                      }
                    }}
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteStaffMutation.mutate(member.id)}
                  disabled={deleteStaffMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleStaffPhoto(member.id, file);
                }}
              />
              {member.photoAssetId && (
                <span className="text-[11px] text-muted-foreground">Photo set ✓</span>
              )}
            </div>
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
          <Button size="sm" variant="outline" onClick={() => addEventMutation.mutate()} disabled={addEventMutation.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add event
          </Button>
        </div>
        <div className="space-y-4">
          {(eventsQuery.data ?? []).map((event) => (
            <div key={event.id} className="space-y-3 rounded-md border border-border px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <Field label="Title">
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={event.title}
                    onBlur={(e) => {
                      if (e.target.value !== event.title) {
                        updateEventMutation.mutate({ eventId: event.id, data: { title: e.target.value } });
                      }
                    }}
                  />
                </Field>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteEventMutation.mutate(event.id)}
                  disabled={deleteEventMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <Field label="Subtitle">
                <input
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  defaultValue={event.subtitle ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (event.subtitle ?? "")) {
                      updateEventMutation.mutate({ eventId: event.id, data: { subtitle: e.target.value || null } });
                    }
                  }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start date">
                  <input
                    type="date"
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={toDateInputValue(event.startDate)}
                    onBlur={(e) => {
                      if (e.target.value) {
                        updateEventMutation.mutate({
                          eventId: event.id,
                          data: { startDate: new Date(e.target.value).toISOString() } as Partial<CompanyEventRow>,
                        });
                      }
                    }}
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="date"
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={toDateInputValue(event.endDate)}
                    onBlur={(e) => {
                      if (e.target.value) {
                        updateEventMutation.mutate({
                          eventId: event.id,
                          data: { endDate: new Date(e.target.value).toISOString() } as Partial<CompanyEventRow>,
                        });
                      }
                    }}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Time range" hint='e.g. "6:00 — 8:00 PM Nightly"'>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={event.timeRange ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (event.timeRange ?? "")) {
                        updateEventMutation.mutate({ eventId: event.id, data: { timeRange: e.target.value || null } });
                      }
                    }}
                  />
                </Field>
                <Field label="Age range" hint='e.g. "Pre-K — 12th Grade"'>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    defaultValue={event.ageRange ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (event.ageRange ?? "")) {
                        updateEventMutation.mutate({ eventId: event.id, data: { ageRange: e.target.value || null } });
                      }
                    }}
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  rows={3}
                  defaultValue={event.description ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (event.description ?? "")) {
                      updateEventMutation.mutate({ eventId: event.id, data: { description: e.target.value || null } });
                    }
                  }}
                />
              </Field>
              <Field
                label="Registration URL"
                hint="A QR code linking here is generated automatically when this is set."
              >
                <input
                  type="url"
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  defaultValue={event.registrationUrl ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (event.registrationUrl ?? "")) {
                      updateEventMutation.mutate({
                        eventId: event.id,
                        data: { registrationUrl: e.target.value || null } as Partial<CompanyEventRow>,
                      });
                    }
                  }}
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
                    if (file) handleFlyerUpload(event.id, file);
                  }}
                />
              </Field>
              {event.flyerAssetId && <span className="text-[11px] text-muted-foreground">Flyer set ✓</span>}
            </div>
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

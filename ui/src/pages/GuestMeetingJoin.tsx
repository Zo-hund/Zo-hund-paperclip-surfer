/**
 * GuestMeetingJoin
 *
 * Public, session-independent onboarding lobby for a meeting guest magic
 * link (route: guest/meeting/:token). Modeled on InviteLanding.tsx's pattern:
 * resolve the token via a dedicated unauthenticated API call, render based
 * on server-validated state, no dependency on CompanyContext/CloudAccessGate.
 *
 * Before dropping the guest into the live room, this page shows who invited
 * them (company branding + host), what room/pod they're joining, and what to
 * expect — so an external client lands prepared, not in a cold video grid.
 *
 * Any invalid/expired/revoked token resolves to a uniform 404 from the
 * server (see meeting-guest-service.ts) — this page shows one generic
 * "link no longer valid" state rather than distinguishing the reason.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mic, Radio, Sparkles, UserRound } from "lucide-react";
import { useParams } from "@/lib/router";
import { guestMeetingsApi, type GuestJoinResult, type GuestMeetingSummary } from "../api/guestMeetings";
import { Button } from "@/components/ui/button";
import { GuestMeetingRoom } from "../components/meetings/GuestMeetingRoom";

function meetingTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Brand-colored logo tile: company logo image when set, monogram fallback. */
function CompanyMark({ meeting }: { meeting: GuestMeetingSummary }) {
  const brand = meeting.companyBrandColor ?? undefined;
  if (meeting.companyLogoUrl) {
    return (
      <img
        src={meeting.companyLogoUrl}
        alt={meeting.companyName ?? "Company logo"}
        className="h-16 w-16 rounded-xl border border-border bg-background object-contain p-1.5"
        style={brand ? { borderColor: brand } : undefined}
      />
    );
  }
  const initial = (meeting.companyName ?? "M").trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted text-2xl font-bold"
      style={brand ? { borderColor: brand, color: brand } : undefined}
    >
      {initial}
    </div>
  );
}

const ONBOARDING_STEPS = [
  { icon: UserRound, text: "Enter your name so everyone knows who joined" },
  { icon: Mic, text: "Allow microphone access when your browser asks" },
  { icon: Sparkles, text: "You'll join live — the team and their AI host will greet you" },
] as const;

export function GuestMeetingJoin() {
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [guestName, setGuestName] = useState("");
  const [connection, setConnection] = useState<GuestJoinResult | null>(null);

  const resolveQuery = useQuery({
    queryKey: ["guest-meeting-resolve", token],
    queryFn: () => guestMeetingsApi.resolve(token),
    enabled: token.length > 0,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: () => guestMeetingsApi.join(token, guestName.trim()),
    onSuccess: (result) => setConnection(result),
  });

  if (connection) {
    return (
      <GuestMeetingRoom
        connection={connection}
        meetingTitle={resolveQuery.data?.meetingTitle ?? "Meeting"}
        onLeave={() => setConnection(null)}
      />
    );
  }

  if (!token) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">Invalid meeting link.</div>;
  }

  if (resolveQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading meeting…</div>;
  }

  if (resolveQuery.error || !resolveQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">This link is no longer valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired or been revoked by the meeting host. Ask them for a new link.
          </p>
        </div>
      </div>
    );
  }

  const meeting = resolveQuery.data;
  const brand = meeting.companyBrandColor ?? undefined;

  if (meeting.meetingStatus !== "active") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">This meeting has ended</h1>
          <p className="mt-2 text-sm text-muted-foreground">{meeting.meetingTitle}{meeting.companyName ? ` — ${meeting.companyName}` : ""}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Brand accent strip */}
        <div className="h-1.5 w-full bg-primary" style={brand ? { backgroundColor: brand } : undefined} />

        <div className="p-6">
          <div className="flex items-start gap-4">
            <CompanyMark meeting={meeting} />
            <div className="min-w-0 flex-1">
              {meeting.companyName && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meeting.companyName}</p>
              )}
              <h1 className="mt-0.5 text-xl font-bold leading-tight">{meeting.meetingTitle}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className="h-3 w-3 text-green-400" />
                Live now — join from your browser, no account or download needed
              </p>
            </div>
          </div>

          {/* Room / pod details */}
          <div className="mt-5 space-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Session type</span>
              <span className="text-xs font-medium">{meetingTypeLabel(meeting.meetingType)}</span>
            </div>
            {meeting.podKey && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Room / pod</span>
                <span className="text-xs font-mono">{meeting.podKey}</span>
              </div>
            )}
            {meeting.hostName && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Invited by</span>
                <span className="text-xs font-medium">{meeting.hostName}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Link valid until</span>
              <span className="text-xs">{new Date(meeting.expiresAt).toLocaleString()}</span>
            </div>
          </div>

          {/* What to expect */}
          <div className="mt-5">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Before you join</p>
            <ul className="mt-2 space-y-2">
              {ONBOARDING_STEPS.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <label className="mt-5 block text-sm">
            <span className="mb-1 block text-muted-foreground">Your name</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="e.g. Jane from Acme Corp"
              maxLength={100}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && guestName.trim().length > 0 && !joinMutation.isPending) {
                  joinMutation.mutate();
                }
              }}
            />
          </label>

          {joinMutation.error && (
            <p className="mt-3 text-sm text-destructive">
              {joinMutation.error instanceof Error ? joinMutation.error.message : "Failed to join the meeting"}
            </p>
          )}

          <Button
            className="mt-5 w-full"
            disabled={joinMutation.isPending || guestName.trim().length === 0}
            onClick={() => joinMutation.mutate()}
          >
            {joinMutation.isPending ? "Joining…" : "Join Live Meeting"}
          </Button>
        </div>
      </div>
    </div>
  );
}

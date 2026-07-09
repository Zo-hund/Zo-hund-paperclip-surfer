/**
 * GuestMeetingJoin
 *
 * Public, session-independent landing page for a meeting guest magic link
 * (route: guest/meeting/:token). Modeled on InviteLanding.tsx's pattern:
 * resolve the token via a dedicated unauthenticated API call, render based
 * on server-validated state, no dependency on CompanyContext/CloudAccessGate.
 *
 * Any invalid/expired/revoked token resolves to a uniform 404 from the
 * server (see meeting-guest-service.ts) — this page shows one generic
 * "link no longer valid" state rather than distinguishing the reason.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@/lib/router";
import { guestMeetingsApi, type GuestJoinResult } from "../api/guestMeetings";
import { Button } from "@/components/ui/button";
import { GuestMeetingRoom } from "../components/meetings/GuestMeetingRoom";

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
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">This link is no longer valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired or been revoked by the meeting host. Ask them for a new link.
          </p>
        </div>
      </div>
    );
  }

  const meeting = resolveQuery.data;

  if (meeting.meetingStatus !== "active") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">This meeting has ended</h1>
          <p className="mt-2 text-sm text-muted-foreground">{meeting.meetingTitle}{meeting.companyName ? ` — ${meeting.companyName}` : ""}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">You're invited to join {meeting.meetingTitle}</h1>
        {meeting.companyName && <p className="mt-1 text-sm text-muted-foreground">Hosted by {meeting.companyName}</p>}

        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-muted-foreground">Your name</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            placeholder="e.g. Jane from Acme Corp"
            maxLength={100}
            autoFocus
          />
        </label>

        {joinMutation.error && (
          <p className="mt-3 text-sm text-destructive">
            {joinMutation.error instanceof Error ? joinMutation.error.message : "Failed to join the meeting"}
          </p>
        )}

        <Button
          className="mt-5"
          disabled={joinMutation.isPending || guestName.trim().length === 0}
          onClick={() => joinMutation.mutate()}
        >
          {joinMutation.isPending ? "Joining…" : "Join Meeting"}
        </Button>
      </div>
    </div>
  );
}

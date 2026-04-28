type InviteDelivery =
  | {
      attempted: false;
    }
  | {
      attempted: true;
      accepted: boolean;
      recipient: string;
      provider: "resend";
      messageId: string | null;
      subject: string;
    };

export function InviteDeliverySummary({
  delivery,
}: {
  delivery?: InviteDelivery;
}) {
  if (!delivery || !delivery.attempted) return null;

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-medium text-foreground">Invite email delivery</div>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          {delivery.accepted ? "Accepted by Resend" : "Not accepted"}
        </span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Recipient
          </div>
          <div className="rounded border border-border/70 bg-background/80 px-2 py-1 font-mono text-foreground">
            {delivery.recipient}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Provider
          </div>
          <div className="rounded border border-border/70 bg-background/80 px-2 py-1 font-mono text-foreground">
            {delivery.provider}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Search this subject in your mailbox
          </div>
          <div className="rounded border border-border/70 bg-background/80 px-2 py-1 font-mono text-foreground">
            {delivery.subject}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Resend message ID
          </div>
          <div className="rounded border border-border/70 bg-background/80 px-2 py-1 font-mono text-foreground">
            {delivery.messageId ?? "Unavailable"}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          If the email seems missing, search by the subject above first, then compare
          the message ID with Resend/logs.
        </p>
      </div>
    </div>
  );
}

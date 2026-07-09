import { useState } from "react";
import { Check, Copy, Loader2, QrCode, Trash2, UserPlus2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meetingsApi } from "../../api/meetings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CertificateQr } from "../CertificateQr";

interface InviteGuestDialogProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
}

function guestLinkUrl(token: string) {
  return `${window.location.origin}/guest/meeting/${token}`;
}

export function InviteGuestDialog({ meetingId, open, onClose }: InviteGuestDialogProps) {
  const queryClient = useQueryClient();
  const [guestLabel, setGuestLabel] = useState("");
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const invitesQuery = useQuery({
    queryKey: ["meeting-guest-invites", meetingId],
    queryFn: () => meetingsApi.listGuestInvites(meetingId),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => meetingsApi.createGuestInvite(meetingId, { guestLabel: guestLabel.trim() || undefined }),
    onSuccess: (result) => {
      setNewLink(guestLinkUrl(result.token));
      setShowQr(false);
      setGuestLabel("");
      queryClient.invalidateQueries({ queryKey: ["meeting-guest-invites", meetingId] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => meetingsApi.revokeGuestInvite(meetingId, inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-guest-invites", meetingId] }),
  });

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const invites = (invitesQuery.data ?? []).filter((i) => !i.revokedAt);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-widest text-sm">
            <UserPlus2 className="h-4 w-4 text-primary" />
            Invite Guest
          </DialogTitle>
          <DialogDescription className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
            Generate a link for an external client or collaborator — no Paperclip account required
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            value={guestLabel}
            onChange={(e) => setGuestLabel(e.target.value)}
            placeholder="Label (optional, e.g. Client — Acme Corp)"
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate Link"}
          </Button>
        </div>

        {newLink && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.03] p-2">
              <span className="flex-1 truncate text-xs font-mono">{newLink}</span>
              <Button size="icon-sm" variant="ghost" onClick={() => setShowQr((v) => !v)} title="Show QR code">
                <QrCode className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => copyLink(newLink)}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {showQr && (
              <div className="flex justify-center rounded-md border border-primary/10 bg-primary/[0.02] p-3">
                <CertificateQr verifyUrl={newLink} size={160} />
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-primary/10">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active links</p>
          <div className="space-y-2 max-h-[30vh] overflow-y-auto">
            {invites.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No active guest links.</p>
            )}
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-2 rounded-md border border-primary/10 bg-primary/[0.02] p-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">{invite.guestLabel ?? "Guest link"}</p>
                  <p className="text-[10px] text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleString()}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={revokeMutation.isPending && revokeMutation.variables === invite.id}
                  onClick={() => revokeMutation.mutate(invite.id)}
                  title="Revoke"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-primary/10 flex justify-end">
          <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

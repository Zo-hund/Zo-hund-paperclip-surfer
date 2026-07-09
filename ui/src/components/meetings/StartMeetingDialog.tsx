import { useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { meetingsApi, type Meeting } from "../../api/meetings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "../../context/ToastContext";

interface StartMeetingDialogProps {
  companyId: string;
  open: boolean;
  onClose: () => void;
  /** Existing meetings, used only to derive distinct podKey values for the datalist — no new endpoint needed. */
  existingMeetings?: Meeting[];
  onStarted: (meeting: Meeting) => void;
}

export function StartMeetingDialog({ companyId, open, onClose, existingMeetings, onStarted }: StartMeetingDialogProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [title, setTitle] = useState(() => `Strategic Session - ${new Date().toLocaleDateString()}`);
  const [podKey, setPodKey] = useState("");

  const podKeyOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const m of existingMeetings ?? []) {
      if (m.podKey) keys.add(m.podKey);
    }
    return Array.from(keys);
  }, [existingMeetings]);

  const startMutation = useMutation({
    mutationFn: () =>
      meetingsApi.start({
        companyId,
        title: title.trim(),
        type: "board_meet",
        podKey: podKey.trim() || undefined,
      }),
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ["meetings", companyId] });
      if (meeting.calendarSyncWarning) {
        pushToast({ title: "Calendar sync issue", body: meeting.calendarSyncWarning, tone: "warn" });
      }
      onStarted(meeting);
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-widest text-sm">
            <Radio className="h-4 w-4 text-primary" />
            Start Live Meeting
          </DialogTitle>
          <DialogDescription className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
            Optionally mark this as part of a recurring pod to pick up last time's context
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Recurring pod (optional)</span>
            <Input
              list="meeting-pod-keys"
              value={podKey}
              onChange={(e) => setPodKey(e.target.value)}
              placeholder="e.g. weekly-standup"
            />
            <datalist id="meeting-pod-keys">
              {podKeyOptions.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="pt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={startMutation.isPending || title.trim().length === 0}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending ? "Starting…" : "Start"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

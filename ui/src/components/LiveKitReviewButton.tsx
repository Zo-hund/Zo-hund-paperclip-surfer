import { useState } from "react";
import { Video, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

export function LiveKitReviewButton({ slug, deliverableId, deliverableTitle }: {
  slug: string;
  deliverableId: string;
  deliverableTitle: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [roomInfo, setRoomInfo] = useState<{ token: string; url: string; roomName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function createRoom() {
    setState("loading");
    try {
      const roomName = `review-${slug}-${deliverableId.slice(0, 8)}`;
      const res = await api.post<{ token: string; url: string; roomName: string; identity: string }>("/livekit/token", {
        roomName,
        identity: `client-${slug}`,
      });
      setRoomInfo(res);
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }

  function copyRoomLink() {
    if (roomInfo) {
      navigator.clipboard.writeText(`${roomInfo.url}/room/${roomInfo.roomName}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (state === "unavailable") {
    return (
      <span className="text-xs text-muted-foreground italic">Video reviews not configured</span>
    );
  }

  if (state === "ready" && roomInfo) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-emerald-400 font-medium">Room ready</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={copyRoomLink}>
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={createRoom} disabled={state === "loading"}>
      {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
      Request review call
    </Button>
  );
}

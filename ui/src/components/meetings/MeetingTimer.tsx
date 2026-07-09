import { useEffect, useState } from "react";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface MeetingTimerProps {
  /** ISO timestamp the timer counts up from. */
  startedAt: string;
  className?: string;
}

/** Ticking elapsed-time display for a live meeting. */
export function MeetingTimer({ startedAt, className }: MeetingTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = now - new Date(startedAt).getTime();
  return <span className={className}>{formatElapsed(elapsed)}</span>;
}

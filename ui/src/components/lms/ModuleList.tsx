import React from "react";
import { CheckCircle2, Lock, PlayCircle, Headphones, Video, Mic } from "lucide-react";
import type { LmsModule } from "@/api/lmsAnalytics";

interface ModuleListProps {
  modules: LmsModule[];
  activeModuleId: string | null;
  onSelect: (module: LmsModule) => void;
}

function contentIcon(type: LmsModule["contentType"]) {
  switch (type) {
    case "video_upload":
    case "video_embed": return <Video className="h-3 w-3" />;
    case "audio_upload": return <Headphones className="h-3 w-3" />;
    case "ai_narration": return <Mic className="h-3 w-3" />;
  }
}

function progressRing(pct: number) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
      <circle
        cx="14" cy="14" r={r} fill="none" stroke="currentColor" strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 14 14)"
        className="text-primary transition-all"
      />
    </svg>
  );
}

export function ModuleList({ modules, activeModuleId, onSelect }: ModuleListProps) {
  if (modules.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        No modules yet. Add modules to this workshop.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {modules.map((m, idx) => {
        const completed = !!m.progress?.completedAt;
        const watched = m.progress?.watchedSeconds ?? 0;
        const total = m.progress?.totalSeconds ?? m.durationSeconds ?? 0;
        const pct = total > 0 ? Math.min(Math.round((watched / total) * 100), 100) : 0;
        const isActive = m.id === activeModuleId;

        return (
          <button
            key={m.id}
            onClick={() => m.unlocked && onSelect(m)}
            disabled={!m.unlocked}
            title={!m.unlocked ? "Complete the prerequisite module to unlock" : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-accent"
            } ${!m.unlocked ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span className="text-[10px] text-muted-foreground font-mono w-5 text-center shrink-0">
              {idx + 1}
            </span>

            {completed ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : !m.unlocked ? (
              <Lock className="h-5 w-5 text-muted-foreground/50 shrink-0" />
            ) : pct > 0 ? (
              progressRing(pct)
            ) : (
              <PlayCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}

            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>{m.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-muted-foreground">{contentIcon(m.contentType)}</span>
                {m.durationSeconds && (
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round(m.durationSeconds / 60)}m
                  </span>
                )}
                {m.quizData?.questions?.length ? (
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest">· Quiz</span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

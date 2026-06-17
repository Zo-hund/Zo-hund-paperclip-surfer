import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, FileText, ChevronDown, ChevronUp, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { ModuleQuiz } from "./ModuleQuiz";
import { lmsAnalyticsApi, type LmsModule } from "@/api/lmsAnalytics";

interface ModulePlayerProps {
  module: LmsModule;
  companyId: string;
  enrollmentId?: string;
  onComplete: () => void;
}

// ── YouTube IFrame loader ────────────────────────────────────────────────────

let ytApiReady = false;
const ytPendingCallbacks: Array<() => void> = [];

function ensureYouTubeApi(cb: () => void) {
  if (ytApiReady) { cb(); return; }
  ytPendingCallbacks.push(cb);
  if (!document.getElementById("yt-iframe-api")) {
    const s = document.createElement("script");
    s.id = "yt-iframe-api";
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
    (window as unknown as Record<string, unknown>)["onYouTubeIframeAPIReady"] = () => {
      ytApiReady = true;
      ytPendingCallbacks.forEach(fn => fn());
      ytPendingCallbacks.length = 0;
    };
  }
}

function youtubeVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

function vimeoVideoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m?.[1] ?? null;
}

// ── Component ────────────────────────────────────────────────────────────────

const PROGRESS_THROTTLE_MS = 10_000;
const YT_POLL_MS = 15_000;

export function ModulePlayer({ module, companyId, enrollmentId, onComplete }: ModulePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<Record<string, unknown> | null>(null);
  const ytPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressMs = useRef(0);
  const lastReportedSeconds = useRef(0);

  // Use refs for quiz state so event-listener closures stay fresh
  const showQuizRef = useRef(false);
  const quizPassedRef = useRef(false);

  const [showQuiz, setShowQuiz] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [generatingNarration, setGeneratingNarration] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [narrationUrl, setNarrationUrl] = useState(module.aiNarrationUrl);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const hasQuiz = !!(module.quizData?.questions?.length);

  // ── Post progress (fire-and-forget) ───────────────────────────────────────

  const postProgress = useCallback((watchedSec: number, totalSec?: number) => {
    const now = Date.now();
    if (now - lastProgressMs.current < PROGRESS_THROTTLE_MS) return;
    if (Math.abs(watchedSec - lastReportedSeconds.current) < 2) return;
    lastProgressMs.current = now;
    lastReportedSeconds.current = watchedSec;
    lmsAnalyticsApi
      .postProgress(companyId, module.id, {
        watchedSeconds: Math.round(watchedSec),
        totalSeconds: totalSec != null ? Math.round(totalSec) : undefined,
        enrollmentId,
      })
      .catch(() => {/* non-critical */});
  }, [companyId, module.id, enrollmentId]);

  // ── 90% completion gate ────────────────────────────────────────────────────

  const check90Pct = useCallback((watched: number, total: number) => {
    if (total <= 0 || showQuizRef.current || quizPassedRef.current) return;
    if (watched / total < 0.9) return;
    if (hasQuiz) {
      showQuizRef.current = true;
      setShowQuiz(true);
    } else {
      quizPassedRef.current = true;
      onComplete();
    }
  }, [hasQuiz, onComplete]);

  // ── HTML5 <video>/<audio> wiring ──────────────────────────────────────────

  useEffect(() => {
    const el = videoRef.current ?? audioRef.current;
    if (!el) return;

    let lastTickTime = 0;

    function onTimeUpdate() {
      const now = Date.now();
      if (now - lastTickTime < PROGRESS_THROTTLE_MS) return;
      lastTickTime = now;
      if (!Number.isFinite(el!.duration)) return;
      postProgress(el!.currentTime, el!.duration);
      check90Pct(el!.currentTime, el!.duration);
    }
    function onPauseOrEnd() {
      if (!Number.isFinite(el!.duration)) return;
      lastTickTime = 0; // force report on next check
      postProgress(el!.currentTime, el!.duration);
      check90Pct(el!.currentTime, el!.duration);
    }

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("pause", onPauseOrEnd);
    el.addEventListener("ended", onPauseOrEnd);

    // Resume from saved position
    const savedSeconds = module.progress?.watchedSeconds ?? 0;
    if (savedSeconds > 5) {
      const trySeek = () => {
        if (Number.isFinite(el.duration) && savedSeconds < el.duration - 2) {
          el.currentTime = savedSeconds;
          el.removeEventListener("loadedmetadata", trySeek);
        }
      };
      el.addEventListener("loadedmetadata", trySeek);
    }

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("pause", onPauseOrEnd);
      el.removeEventListener("ended", onPauseOrEnd);
    };
  }, [module.id, postProgress, check90Pct]);

  // ── YouTube IFrame ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (module.contentType !== "video_embed") return;
    const url = module.contentUrl ?? "";
    const ytId = youtubeVideoId(url);
    if (!ytId || !ytContainerRef.current) return;

    ensureYouTubeApi(() => {
      if (!ytContainerRef.current) return;
      const YT = (window as unknown as Record<string, unknown>)["YT"] as Record<string, unknown>;
      const Player = YT["Player"] as new (el: HTMLElement, opts: Record<string, unknown>) => Record<string, () => number>;
      const PlayerState = YT["PlayerState"] as Record<string, number>;

      const player = new Player(ytContainerRef.current, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (ev: { data: number }) => {
            const watched = player.getCurrentTime();
            const total = player.getDuration();
            if (ev.data === PlayerState["PAUSED"] || ev.data === PlayerState["ENDED"]) {
              postProgress(watched, total);
              check90Pct(watched, total);
            }
          },
        },
      });
      ytPlayerRef.current = player as unknown as Record<string, unknown>;

      ytPollRef.current = setInterval(() => {
        const state = (player as unknown as { getPlayerState: () => number }).getPlayerState();
        if (state === PlayerState["PLAYING"]) {
          const watched = player.getCurrentTime();
          const total = player.getDuration();
          postProgress(watched, total);
          check90Pct(watched, total);
        }
      }, YT_POLL_MS);
    });

    return () => {
      if (ytPollRef.current) clearInterval(ytPollRef.current);
      try { (ytPlayerRef.current as unknown as { destroy: () => void } | null)?.destroy(); } catch { /* ignore */ }
      ytPlayerRef.current = null;
    };
  }, [module.id, module.contentType, module.contentUrl, postProgress, check90Pct]);

  // ── AI narration generate ─────────────────────────────────────────────────

  async function handleGenerate() {
    setGeneratingNarration(true);
    setNarrationError(null);
    try {
      const res = await lmsAnalyticsApi.generateNarration(companyId, module.id);
      if ("url" in res) {
        setNarrationUrl(res.url);
      } else {
        setNarrationError(res.error);
      }
    } catch {
      setNarrationError("Request failed. Try again.");
    } finally {
      setGeneratingNarration(false);
    }
  }

  // ── Quiz callbacks ─────────────────────────────────────────────────────────

  async function handleQuizSubmit(answers: number[]) {
    return lmsAnalyticsApi.submitQuiz(companyId, module.id, { answers, enrollmentId });
  }

  function handleQuizContinue() {
    showQuizRef.current = false;
    quizPassedRef.current = true;
    setShowQuiz(false);
    onComplete();
  }

  // ── Quiz overlay ───────────────────────────────────────────────────────────

  if (showQuiz && hasQuiz) {
    return (
      <ModuleQuiz
        questions={module.quizData!.questions}
        onSubmit={handleQuizSubmit}
        onContinue={handleQuizContinue}
      />
    );
  }

  const vimeoId = module.contentType === "video_embed" && module.contentUrl
    ? vimeoVideoId(module.contentUrl)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Video upload */}
      {module.contentType === "video_upload" && (
        <div className="rounded-lg overflow-hidden bg-black aspect-video">
          <video
            ref={videoRef}
            src={module.contentUrl ?? undefined}
            controls
            className="w-full h-full"
            onError={() => setMediaError("Video failed to load.")}
          />
        </div>
      )}

      {/* Audio upload */}
      {module.contentType === "audio_upload" && (
        <div className="rounded-lg p-6 bg-accent/20 border border-border flex flex-col items-center gap-4">
          <audio
            ref={audioRef}
            src={module.contentUrl ?? undefined}
            controls
            className="w-full"
            onError={() => setMediaError("Audio failed to load.")}
          />
        </div>
      )}

      {/* Video embed (YouTube / Vimeo) */}
      {module.contentType === "video_embed" && (
        <div className="rounded-lg overflow-hidden aspect-video bg-black">
          {vimeoId ? (
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}?dnt=1`}
              className="w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              title={module.title}
            />
          ) : (
            <div ref={ytContainerRef} className="w-full h-full" />
          )}
        </div>
      )}

      {/* AI narration */}
      {module.contentType === "ai_narration" && (
        <div className="rounded-lg p-5 bg-accent/20 border border-border space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest">
              <Mic className="h-3 w-3" />
              AI Narrated
            </span>
          </div>

          {narrationUrl ? (
            <audio
              ref={audioRef}
              src={narrationUrl}
              controls
              className="w-full"
              onError={() => setMediaError("Narration audio failed to load.")}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-sm text-muted-foreground text-center">
                AI narration not yet generated for this module.
              </p>
              {narrationError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {narrationError}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generatingNarration}
                className="gap-2"
              >
                {generatingNarration ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5" /> Generate AI Narration</>
                )}
              </Button>
            </div>
          )}

          {module.contentText && (
            <div className="border-t border-border/40 pt-3">
              <button
                onClick={() => setShowScript(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest font-medium"
              >
                <FileText className="h-3.5 w-3.5" />
                {showScript ? "Hide" : "View"} Script
                {showScript ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showScript && (
                <div className="mt-3 p-4 rounded-md bg-muted/50 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {module.contentText}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Media error */}
      {mediaError && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {mediaError}
        </p>
      )}

      {/* Module description */}
      {module.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{module.description}</p>
      )}
    </div>
  );
}

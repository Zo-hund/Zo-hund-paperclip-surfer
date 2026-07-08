import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CanvasCursorEvent, CanvasEvent } from "../../hooks/useLiveKitVoice";
import type { BufferedStroke } from "../../hooks/useMeetingCanvasBuffer";

interface MeetingCanvasProps {
  /** Broadcast a 2-point stroke segment to remote participants. */
  sendCanvasStroke?: (stroke: { points: { x: number; y: number }[]; color: string; width: number }) => void;
  /** Broadcast a clear to remote participants. */
  sendCanvasClear?: () => void;
  /** The most recent canvas event received from a remote participant (stroke or clear). */
  remoteEvent?: CanvasEvent | null;
  /** Broadcast the local pointer position while over the canvas (lossy). */
  sendCanvasCursor?: (pos: { x: number; y: number }) => void;
  /** Live remote cursors (parent prunes stale entries). */
  cursors?: CanvasCursorEvent[];
  /** Session-long stroke history — replayed on mount so mode switches don't wipe the drawing. */
  bufferedStrokes?: BufferedStroke[];
  /** Bumped by the parent buffer; a decrease-to-empty means a clear happened while unmounted. */
  bufferVersion?: number;
  /** Persist the canvas as a PNG artifact on the meeting. */
  onSaveSnapshot?: () => Promise<void>;
  savingSnapshot?: boolean;
}

const COLORS = ["#e2e8f0", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];

/** Deterministic per-identity cursor color. */
function colorForIdentity(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) hash = (hash * 31 + identity.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

const CURSOR_THROTTLE_MS = 33;

/**
 * Live-synced freehand drawing surface for meetings. Strokes are broadcast as
 * small 2-point segments over the LiveKit data channel; the overlay-level
 * stroke buffer replays history on mount (mode switches no longer wipe the
 * drawing) and powers PNG snapshot persistence.
 */
export function MeetingCanvas({ sendCanvasStroke, sendCanvasClear, remoteEvent, sendCanvasCursor, cursors, bufferedStrokes, onSaveSnapshot, savingSnapshot }: MeetingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorSentRef = useRef(0);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);

  const drawSegment = useCallback((from: { x: number; y: number }, to: { x: number; y: number }, strokeColor: string, strokeWidth: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, []);

  const replayBuffer = useCallback(() => {
    const strokes = bufferedStrokes;
    if (!strokes) return;
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(stroke.points[i - 1], stroke.points[i], stroke.color, stroke.width);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSegment]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;
    }
    replayBuffer();
  }, [replayBuffer]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Apply incoming remote events (strokes drawn by other participants).
  useEffect(() => {
    if (!remoteEvent) return;
    if (remoteEvent.type === "canvas_clear") {
      clearCanvas();
      return;
    }
    if (remoteEvent.type === "canvas_stroke" && remoteEvent.points.length >= 2) {
      const [from, to] = remoteEvent.points;
      drawSegment(from, to, remoteEvent.color, remoteEvent.width);
    }
  }, [remoteEvent, drawSegment, clearCanvas]);

  const getRelativePoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    lastPointRef.current = getRelativePoint(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getRelativePoint(e);
    const now = Date.now();
    if (sendCanvasCursor && now - lastCursorSentRef.current >= CURSOR_THROTTLE_MS) {
      lastCursorSentRef.current = now;
      sendCanvasCursor(point);
    }
    if (!drawingRef.current || !lastPointRef.current) return;
    const from = lastPointRef.current;
    drawSegment(from, point, color, width);
    sendCanvasStroke?.({ points: [from, point], color, width });
    lastPointRef.current = point;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    clearCanvas();
    sendCanvasClear?.();
  };

  return (
    <div className="flex-1 flex flex-col rounded-xl overflow-hidden border border-white/10 bg-[#0a0a14]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/40">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-[9px] font-black uppercase tracking-wide text-white/50">
              <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: color }} />
              Color
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "border-white scale-110" : "border-white/20"}`}
                style={{ background: c }}
              />
            ))}
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-[9px] font-black uppercase tracking-wide text-white/50">
              Width: {width}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 flex gap-1.5">
            {[1, 3, 6, 12].map((w) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`h-8 w-8 rounded-lg flex items-center justify-center border ${width === w ? "border-[#94a3b8] bg-[#94a3b8]/20" : "border-white/10"}`}>
                <span className="rounded-full bg-white" style={{ width: Math.min(w, 16), height: Math.min(w, 16) }} />
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        {onSaveSnapshot && (
          <Button size="sm" variant="ghost" disabled={savingSnapshot} onClick={() => void onSaveSnapshot()}
            className="h-8 px-2 gap-1.5 text-[9px] font-black uppercase tracking-wide text-white/50 hover:text-emerald-400">
            <ImageDown className="h-3.5 w-3.5" /> {savingSnapshot ? "Saving…" : "Save Snapshot"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleClear} className="h-8 px-2 gap-1.5 text-[9px] font-black uppercase tracking-wide text-white/50 hover:text-red-400">
          <Eraser className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
      <div ref={wrapRef} className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {/* Live remote cursors */}
        {(cursors ?? []).map((c) => {
          const cursorColor = colorForIdentity(c.identity);
          return (
            <div key={c.identity} className="absolute pointer-events-none transition-all duration-75 ease-linear"
              style={{ left: c.x, top: c.y, transform: "translate(-50%, -50%)" }}>
              <span className="block h-3 w-3 rounded-full border-2 border-black/60" style={{ background: cursorColor }} />
              <span className="absolute left-3 top-2 text-[9px] font-medium whitespace-nowrap px-1 rounded" style={{ color: cursorColor, background: "rgba(0,0,0,0.6)" }}>
                {c.identity.replace(/^board-user-/, "").slice(0, 10)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

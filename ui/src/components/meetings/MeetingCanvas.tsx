import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CanvasEvent } from "../../hooks/useLiveKitVoice";

interface MeetingCanvasProps {
  /** Broadcast a 2-point stroke segment to remote participants. */
  sendCanvasStroke?: (stroke: { points: { x: number; y: number }[]; color: string; width: number }) => void;
  /** Broadcast a clear to remote participants. */
  sendCanvasClear?: () => void;
  /** The most recent canvas event received from a remote participant (stroke or clear). */
  remoteEvent?: CanvasEvent | null;
}

const COLORS = ["#e2e8f0", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];

/**
 * Ephemeral, live-synced freehand drawing surface for meetings. Strokes are
 * broadcast as small 2-point segments over the existing LiveKit data channel
 * (same mechanism as tool_call/transcript messages) — no persistence, no
 * backend endpoint. Canvas state lives only in connected clients' memory.
 */
export function MeetingCanvas({ sendCanvasStroke, sendCanvasClear, remoteEvent }: MeetingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);

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
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

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
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = getRelativePoint(e);
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
        <Button size="sm" variant="ghost" onClick={handleClear} className="h-8 px-2 gap-1.5 text-[9px] font-black uppercase tracking-wide text-white/50 hover:text-red-400">
          <Eraser className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className="flex-1 w-full h-full touch-none cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}

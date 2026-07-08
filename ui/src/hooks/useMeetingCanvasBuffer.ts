/**
 * useMeetingCanvasBuffer
 *
 * Accumulates every canvas stroke (local + remote) for the lifetime of a
 * meeting session so the ephemeral shared canvas can be replayed after a
 * mode switch, previewed in the minimized cockpit, and rendered to a PNG
 * snapshot for persistence. Lives at the GlobalVoiceMeetingOverlay level —
 * MeetingCanvas itself stays a dumb draw surface.
 */
import { useCallback, useRef, useState } from "react";
import type { CanvasStrokeEvent } from "./useLiveKitVoice";

export type BufferedStroke = Omit<CanvasStrokeEvent, "type">;

/** Logical snapshot dimensions — strokes are raw client-pixel coords, so we
 *  render onto a fixed-size dark stage large enough for typical viewports. */
export const CANVAS_SNAPSHOT_WIDTH = 1600;
export const CANVAS_SNAPSHOT_HEIGHT = 900;

export function useMeetingCanvasBuffer() {
  const strokesRef = useRef<BufferedStroke[]>([]);
  // Version counter lets consumers re-render/replay cheaply without cloning
  // the (potentially large) stroke array on every 2-point segment.
  const [version, setVersion] = useState(0);

  const addStroke = useCallback((stroke: BufferedStroke) => {
    strokesRef.current.push(stroke);
    setVersion((v) => v + 1);
  }, []);

  const clear = useCallback(() => {
    strokesRef.current = [];
    setVersion((v) => v + 1);
  }, []);

  const getStrokes = useCallback(() => strokesRef.current, []);

  /** Render the buffered strokes to a PNG blob for snapshot persistence. */
  const toPngBlob = useCallback(async (): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SNAPSHOT_WIDTH;
    canvas.height = CANVAS_SNAPSHOT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  }, []);

  return { addStroke, clear, getStrokes, toPngBlob, version, isEmpty: strokesRef.current.length === 0 };
}

import { useState, useRef, useCallback } from "react";

export interface WebRTCState {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraActive: boolean;
  screenActive: boolean;
  cameraError: string | null;
  screenError: string | null;
  startCamera(): Promise<void>;
  stopCamera(): void;
  startScreenShare(): Promise<void>;
  stopScreenShare(): void;
  captureFrame(stream: MediaStream): string | null;
}

function classifyMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        // "Permission dismissed" = user closed the popup without choosing
        if (err.message.toLowerCase().includes("dismissed")) {
          return "Camera permission was dismissed. Click the camera icon in your browser's address bar and select Allow, then try again.";
        }
        return "Camera access was blocked. Click the 🔒 lock icon in your address bar → Site Settings → Camera → Allow.";
      case "NotFoundError":
        return "No camera found. Make sure a webcam is connected and not in use by another app.";
      case "NotReadableError":
        return "Camera is already in use by another application. Close it and try again.";
      case "OverconstrainedError":
        return "Camera doesn't support the requested resolution. Try a different camera.";
      case "AbortError":
        return "Camera access was cancelled.";
      default:
        return `Camera error: ${err.message}`;
    }
  }
  return "Camera access failed. Check browser permissions.";
}

function isUserCancelledMediaPrompt(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "AbortError")
  );
}

export function useWebRTC(): WebRTCState {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const offscreenCanvas = useRef<HTMLCanvasElement | null>(null);

  function getCanvas(): HTMLCanvasElement {
    if (!offscreenCanvas.current) {
      offscreenCanvas.current = document.createElement("canvas");
      offscreenCanvas.current.width = 640;
      offscreenCanvas.current.height = 360;
    }
    return offscreenCanvas.current;
  }

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
        audio: false,
      });
      setCameraStream(stream);
    } catch (err) {
      if (isUserCancelledMediaPrompt(err)) {
        setCameraError("Camera permission was not granted.");
        return;
      }
      const msg = classifyMediaError(err);
      console.error("[useWebRTC] camera access denied", err);
      setCameraError(msg);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    setCameraError(null);
  }, [cameraStream]);

  const startScreenShare = useCallback(async () => {
    setScreenError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5 } },
        audio: true,
      });
      // Auto-cleanup when user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => setScreenStream(null));
      setScreenStream(stream);
    } catch (err) {
      if (isUserCancelledMediaPrompt(err)) {
        // User cancelled screen picker — not an error worth surfacing
        return;
      }
      const msg = `Screen share failed: ${err instanceof DOMException ? err.message : String(err)}`;
      console.error("[useWebRTC] screen share denied or cancelled", err);
      setScreenError(msg);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
    }
    setScreenError(null);
  }, [screenStream]);

  /**
   * Capture one JPEG frame from a MediaStream.
   * Returns base64-encoded JPEG (without data-URL prefix) or null if no video track.
   */
  const captureFrame = useCallback((stream: MediaStream): string | null => {
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return null;

    try {
      const canvas = getCanvas();
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Attempt synchronous capture using existing playing video elements in the DOM
      const existingVideos = document.querySelectorAll<HTMLVideoElement>("video");
      let sourceVideo: HTMLVideoElement | null = null;
      for (const v of existingVideos) {
        if (v.srcObject === stream && v.readyState >= 2) {
          sourceVideo = v;
          break;
        }
      }

      if (sourceVideo) {
        ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        return dataUrl.split(",")[1] ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    cameraStream,
    screenStream,
    cameraActive: !!cameraStream,
    screenActive: !!screenStream,
    cameraError,
    screenError,
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,
    captureFrame,
  };
}

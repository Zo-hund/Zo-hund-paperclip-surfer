import { useState, useRef, useCallback } from "react";

export interface WebRTCState {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraActive: boolean;
  screenActive: boolean;
  startCamera(): Promise<void>;
  stopCamera(): void;
  startScreenShare(): Promise<void>;
  stopScreenShare(): void;
  captureFrame(stream: MediaStream): string | null;
}

export function useWebRTC(): WebRTCState {
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
        audio: false,
      });
      setCameraStream(stream);
    } catch (err) {
      console.error("[useWebRTC] camera access denied", err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5 } },
        audio: true,
      });
      // Auto-cleanup when user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => setScreenStream(null));
      setScreenStream(stream);
    } catch (err) {
      console.error("[useWebRTC] screen share denied or cancelled", err);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
    }
  }, [screenStream]);

  /**
   * Capture one JPEG frame from a MediaStream.
   * Returns base64-encoded JPEG (without data-URL prefix) or null if no video track.
   */
  const captureFrame = useCallback((stream: MediaStream): string | null => {
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return null;

    // Use ImageCapture API if available (Chrome/Edge), else drawImage via hidden <video>
    try {
      const canvas = getCanvas();
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // ImageCapture path
      if (typeof ImageCapture !== "undefined") {
        // Async grab is not suitable here; fall through to video element approach
      }

      // Create a temporary video element bound to the stream
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      // Attempt synchronous capture using existing playing video elements
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
        // Strip "data:image/jpeg;base64," prefix
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
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,
    captureFrame,
  };
}

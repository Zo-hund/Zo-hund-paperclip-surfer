import { useEffect, useMemo } from "react";

export type InteractionAction = "select" | "move-forward" | "move-back" | "move-left" | "move-right" | "grab" | "release" | "menu" | "complete" | "help";
export type InputMethod = "mouse" | "touch" | "controller" | "hands" | "voice" | "gaze" | "keyboard";

export interface InputCapabilities {
  methods: InputMethod[];
  webXR: boolean;
  immersiveAR: boolean;
  immersiveVR: boolean;
  camera: boolean;
  voice: boolean;
  gamepad: boolean;
  touch: boolean;
  handTracking: boolean;
}

export const interactionMap: Record<InteractionAction, Partial<Record<InputMethod, string>>> = {
  select: { mouse: "Click", touch: "Tap", controller: "Trigger", hands: "Pinch", voice: "Select", gaze: "Dwell" },
  "move-forward": { keyboard: "W / Up", touch: "Stick up", controller: "Thumbstick", hands: "Point", voice: "Move forward" },
  "move-back": { keyboard: "S / Down", touch: "Stick down", controller: "Thumbstick", voice: "Move back" },
  "move-left": { keyboard: "A / Left", touch: "Stick left", controller: "Thumbstick", voice: "Move left" },
  "move-right": { keyboard: "D / Right", touch: "Stick right", controller: "Thumbstick", voice: "Move right" },
  grab: { mouse: "Drag", touch: "Hold", controller: "Grip", hands: "Grab", voice: "Grab", gaze: "Dwell" },
  release: { mouse: "Release", touch: "Release", controller: "Release grip", hands: "Release", voice: "Release" },
  menu: { keyboard: "Escape", touch: "Menu", controller: "Menu", hands: "Palm", voice: "Open menu", gaze: "Menu target" },
  complete: { mouse: "Click", touch: "Tap", controller: "Trigger", hands: "Pinch", voice: "Complete step", gaze: "Dwell" },
  help: { keyboard: "H", touch: "Help", controller: "Menu", hands: "Raise hand", voice: "Help", gaze: "Help target" },
};

export async function detectInputCapabilities(): Promise<InputCapabilities> {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr;
  const [immersiveAR, immersiveVR] = await Promise.all([
    xr?.isSessionSupported("immersive-ar").catch(() => false) || false,
    xr?.isSessionSupported("immersive-vr").catch(() => false) || false,
  ]);
  const touch = navigator.maxTouchPoints > 0;
  const gamepad = "getGamepads" in navigator && Array.from(navigator.getGamepads()).some(Boolean);
  const voice = "speechSynthesis" in window || "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  const methods: InputMethod[] = [touch ? "touch" : "mouse", "keyboard"];
  if (gamepad || immersiveVR) methods.push("controller");
  if (immersiveAR || immersiveVR) methods.push("gaze");
  if (immersiveVR) methods.push("hands");
  if (voice) methods.push("voice");
  return {
    methods: Array.from(new Set(methods)), webXR: Boolean(xr), immersiveAR, immersiveVR,
    camera: Boolean(navigator.mediaDevices?.getUserMedia), voice, gamepad, touch, handTracking: immersiveVR,
  };
}

export function fallbackFor(action: InteractionAction, capabilities: InputCapabilities) {
  const preference: InputMethod[] = ["hands", "controller", "touch", "mouse", "keyboard", "voice", "gaze"];
  return preference.find((method) => capabilities.methods.includes(method) && interactionMap[action][method]) || "keyboard";
}

export function useUnifiedInput(onAction: (action: InteractionAction) => void) {
  const keyMap = useMemo<Record<string, InteractionAction>>(() => ({
    w: "move-forward", ArrowUp: "move-forward", s: "move-back", ArrowDown: "move-back",
    a: "move-left", ArrowLeft: "move-left", d: "move-right", ArrowRight: "move-right",
    Enter: "select", " ": "complete", Escape: "menu", h: "help",
  }), []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const action = keyMap[event.key];
      if (!action || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
      event.preventDefault();
      onAction(action);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [keyMap, onAction]);
}

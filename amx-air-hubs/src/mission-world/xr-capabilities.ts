import type { XRCapabilities } from "./types";

export async function detectXRCapabilities(): Promise<XRCapabilities> {
  const xr = navigator.xr;
  const supports = async (mode: XRSessionMode) => Boolean(xr && await xr.isSessionSupported(mode).catch(() => false));
  return {
    secureContext: window.isSecureContext,
    webXR: Boolean(xr),
    immersiveVR: await supports("immersive-vr"),
    immersiveAR: await supports("immersive-ar"),
    gamepads: typeof navigator.getGamepads === "function",
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
  };
}

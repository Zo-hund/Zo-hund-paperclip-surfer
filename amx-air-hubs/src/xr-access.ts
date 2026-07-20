import type { ExperienceMode } from "./immersive";
import type { InputCapabilities } from "./interaction";

export type SpatialAccessMode = Extract<ExperienceMode, "ar" | "vr" | "mr">;

export interface SpatialAccessRoute {
  requested: SpatialAccessMode;
  resolved: ExperienceMode;
  ready: boolean;
  status: string;
}

export function resolveSpatialAccess(mode: SpatialAccessMode, capabilities: InputCapabilities): SpatialAccessRoute {
  if (mode === "ar") {
    if (capabilities.immersiveAR) return { requested: mode, resolved: "ar", ready: true, status: "WebXR AR ready" };
    if (capabilities.camera) return { requested: mode, resolved: "ar", ready: true, status: "Camera AR ready" };
    return { requested: mode, resolved: "3d", ready: false, status: "Browser 3D fallback" };
  }
  if (mode === "vr") {
    return capabilities.immersiveVR
      ? { requested: mode, resolved: "vr", ready: true, status: "Headset ready" }
      : { requested: mode, resolved: "3d", ready: false, status: "Browser 3D fallback" };
  }
  if (capabilities.immersiveAR) return { requested: mode, resolved: "mr", ready: true, status: "Passthrough ready" };
  if (capabilities.camera) return { requested: mode, resolved: "ar", ready: false, status: "Camera AR fallback" };
  return { requested: mode, resolved: "3d", ready: false, status: "Browser 3D fallback" };
}

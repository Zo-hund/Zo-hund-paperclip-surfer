import type { InputCapabilities } from "./interaction";

export type AMXDeviceFamily = "quest" | "ipad" | "chromebook" | "laptop";
export type AMXLaunchMode = "native" | "webxr" | "ar" | "web";

export interface AMXDeviceProfile {
  family: AMXDeviceFamily;
  label: string;
  detail: string;
  preferredMode: AMXLaunchMode;
}

export interface AMXPortfolioApp {
  id: string;
  title: string;
  category: string;
  description: string;
  route: string;
  xrRoute?: string;
  arRoute?: string;
  nativePackage?: string;
  modes: AMXLaunchMode[];
  access: "member" | "operator" | "public";
}

export const portfolioApps: AMXPortfolioApp[] = [
  {
    id: "pathfinder",
    title: "XR Path Finder",
    category: "Native + WebXR",
    description: "Enter guided Quest missions, digital twins, spatial controls, agents, and proof capture.",
    route: "/play/xrt-green-mode",
    xrRoute: "/play/vr/xrt-green-mode",
    arRoute: "/play/ar/xrt-green-mode",
    nativePackage: "cc.amxairhubs.pathfinder",
    modes: ["native", "webxr", "ar", "web"],
    access: "member",
  },
  {
    id: "nexus",
    title: "Nexus Production Pod",
    category: "Collaborative world",
    description: "Build with members and agents, control media walls, cameras, twins, and live rooms.",
    route: "/nexus",
    xrRoute: "/play/vr/webxr-creator",
    arRoute: "/play/ar/webxr-creator",
    modes: ["webxr", "ar", "web"],
    access: "member",
  },
  {
    id: "stage",
    title: "AMX XR Stage",
    category: "Live production",
    description: "Operate events, route cameras and media, manage seats, and publish live showcases.",
    route: "/stage",
    xrRoute: "/venues/theater",
    modes: ["webxr", "web"],
    access: "operator",
  },
  {
    id: "mission-world",
    title: "Mission World",
    category: "Learn + build",
    description: "Complete AI, XR, robotics, automation, and world-building missions across devices.",
    route: "/missions/world",
    xrRoute: "/missions/world?mode=vr",
    modes: ["webxr", "web"],
    access: "member",
  },
  {
    id: "learn",
    title: "Learn Mode",
    category: "Training + workshops",
    description: "Follow drip learning tracks, practice in Pods, submit proof, and unlock real projects.",
    route: "/learn",
    modes: ["web"],
    access: "member",
  },
  {
    id: "live-viewer",
    title: "AMX Live",
    category: "Public broadcast",
    description: "Watch stage programs, event promos, speakers, and community showcases on any screen.",
    route: "/watch/AMXSTAGE",
    modes: ["web"],
    access: "public",
  },
];

export function detectAMXDevice(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints): AMXDeviceProfile {
  const ua = userAgent.toLowerCase();
  if (ua.includes("oculusbrowser") || ua.includes("quest")) {
    return { family: "quest", label: "Meta Quest", detail: "Headset, controllers, hands, VR and supported MR", preferredMode: "webxr" };
  }
  if (ua.includes("ipad") || (ua.includes("macintosh") && maxTouchPoints > 1)) {
    return { family: "ipad", label: "iPad", detail: "Touch 3D, camera workflows and AR Quick Look", preferredMode: "ar" };
  }
  if (ua.includes("cros")) {
    return { family: "chromebook", label: "Chromebook", detail: "Installable PWA, keyboard, touch and browser 3D", preferredMode: "web" };
  }
  return { family: "laptop", label: "Laptop", detail: "Production console, keyboard, camera and browser 3D", preferredMode: "web" };
}

export function resolvePortfolioLaunch(app: AMXPortfolioApp, device: AMXDeviceProfile, capabilities: InputCapabilities) {
  if (device.family === "quest" && app.xrRoute && capabilities.immersiveVR) {
    return { route: app.xrRoute, mode: "webxr" as const, label: "Enter in XR", status: "Headset ready" };
  }
  if (device.family === "ipad" && app.arRoute && capabilities.camera) {
    return { route: app.arRoute, mode: "ar" as const, label: "Open in AR", status: "Camera AR ready" };
  }
  return { route: app.route, mode: "web" as const, label: "Open app", status: device.detail };
}

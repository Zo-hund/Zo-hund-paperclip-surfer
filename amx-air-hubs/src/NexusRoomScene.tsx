import { useEffect, useRef, useState } from "react";
import { Glasses, LoaderCircle, LogOut } from "lucide-react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeoAnchor } from "./geospatial";
import { DEFAULT_NPC_STATE, NPC_WAYPOINTS, waypointFor, type NpcAction, type NpcCommand, type NpcDirection, type NpcRuntimeState, type NpcWaypointId } from "./npc-controller";
import { NEXUS_GLOBE_LEVELS, NEXUS_VFX_PARTICLES, type NexusGlobeLevel, type NexusVfxPreset } from "./nexus-vfx";
import type { NexusXRMode } from "./nexus-xr";
import { forceWebGLDiagnostic, getRendererBackend, type RendererBackend } from "./webgpu";
import { DEFAULT_WORLD_CAMERA_CONTROL, WORLD_CAMERA_POSES, WORLD_CAMERA_RIG_LAYER, normalizeWorldCameraControl, type WorldCameraControl, type WorldCameraId } from "./world-camera-control";
import { SCREEN_WALL_FORMATS, type ScreenLayoutMode, type ScreenWallFit, type ScreenWallFormat } from "./screen-wall";

export type { WorldCameraControl, WorldCameraId } from "./world-camera-control";
export type { ScreenLayoutMode, ScreenWallFit, ScreenWallFormat } from "./screen-wall";

export type LightPreset = "mission" | "focus" | "standby";
export type VideoFit = "contain" | "cover";
export type WorldCameraCapture = (camera?: WorldCameraId) => Promise<Blob | null>;
export type ProductionScreenId = "Screen_User" | "Screen_Agent_Left" | "Screen_Agent_Right";
export type ScreenSourceId = "camera-1" | "camera-2" | "camera-3" | "media" | "map" | "runway" | "amx-air" | "amx-labs" | "black";
export type ScreenProgram = Record<ProductionScreenId, ScreenSourceId>;
export type ScreenTransitionStyle = "cut" | "dip" | "amx-air" | "amx-labs";
export interface ScreenStinger { id:number; targets:ProductionScreenId[]; brand:"amx-air"|"amx-labs"|"dip" }
export interface LocationPanelData {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  roomCode: string;
  selectedAt: string;
  agentContext?: string;
  agentTransport?: "local" | "remote";
}

export const WORLD_CAMERAS: Array<{ id: WorldCameraId; label: string; detail: string }> = [
  { id: "overview", label: "Overview", detail: "Operator orbit camera" },
  { id: "entry", label: "Entry", detail: "Door and participant arrival view" },
  { id: "rack", label: "Rack aisle", detail: "Equipment and cooling aisle view" },
  { id: "briefing", label: "Stage right", detail: "Overhead stage-right view, clear of the display wall" },
];

interface Props {
  localStream: MediaStream | null;
  sceneStreams?: MediaStream[];
  mediaElement?: HTMLVideoElement | null;
  runwayElement?: HTMLVideoElement | null;
  mediaFit?: VideoFit;
  screenProgram: ScreenProgram;
  screenStinger?: ScreenStinger | null;
  screenMode?: ScreenLayoutMode;
  screenWallSource?: ScreenSourceId;
  screenWallFit?: ScreenWallFit;
  screenWallFormat?: ScreenWallFormat;
  locationPanel?: LocationPanelData | null;
  anchors: GeoAnchor[];
  lightPreset: LightPreset;
  vfxPreset?: NexusVfxPreset;
  globeLevel?: NexusGlobeLevel;
  xrMode?: NexusXRMode;
  reducedMotion?: boolean;
  avatarUrl?: string;
  npcCommand?: NpcCommand | null;
  activeWorldCamera?: WorldCameraId;
  cameraControl?: WorldCameraControl;
  onReady?: () => void;
  onBackend?: (backend: RendererBackend) => void;
  onCaptureReady?: (capture: WorldCameraCapture | null) => void;
  onAvatarState?: (state: "idle" | "loading" | "ready" | "error") => void;
  onNpcState?: (state: NpcRuntimeState) => void;
}

function responsiveRoomFov(aspect: number) {
  const baseFov = 42;
  const referenceAspect = 1.45;
  if (aspect >= referenceAspect) return baseFov;
  const verticalRadians = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * referenceAspect / Math.max(0.55, aspect));
  return Math.min(62, THREE.MathUtils.radToDeg(verticalRadians));
}

interface NexusVfxRuntime {
  group: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  positions: Float32Array;
  seeds: Float32Array;
  basePosition: THREE.Vector3;
  currentShift: number;
}

function createHologramParticles(center: THREE.Vector3): NexusVfxRuntime {
  const count = NEXUS_VFX_PARTICLES.show;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const palette = [new THREE.Color(0x55e6ff), new THREE.Color(0xff55d7), new THREE.Color(0xffd36a)];
  for (let index = 0; index < count; index += 1) {
    const angle = ((index * 0.61803398875) % 1) * Math.PI * 2;
    const radius = 0.62 + ((index * 37) % 100) / 100 * 1.28;
    const height = (((index * 53) % 100) / 100 - 0.5) * 2.3;
    const phase = ((index * 71) % 100) / 100 * Math.PI * 2;
    seeds.set([angle, radius, height, phase], index * 4);
    positions.set([Math.cos(angle) * radius, height, Math.sin(angle) * radius], index * 3);
    const color = palette[index % palette.length];
    colors.set([color.r, color.g, color.b], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, NEXUS_VFX_PARTICLES.ambient);
  const material = new THREE.PointsMaterial({
    size: 0.045,
    transparent: true,
    opacity: 0.68,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "Nexus_Hologram_Particles";
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.name = "Nexus_VFX_Particle_System";
  group.position.copy(center);
  group.add(points);
  return { group, geometry, material, positions, seeds, basePosition: center.clone(), currentShift: 0 };
}

function controllerRay(color: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.86 });
  const ray = new THREE.Line(geometry, material);
  ray.name = "Nexus_XR_Controller_Ray";
  ray.scale.z = 4;
  return ray;
}

type ScreenName = ProductionScreenId;

function screenMaterial(texture: THREE.Texture) {
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
}

type ScaleAxis = "x" | "y" | "z";

function mediaSurfaceDimensions(mesh: THREE.Mesh) {
  const savedScale = mesh.userData.mediaBaseScale as [number, number, number] | undefined;
  const baseScale = savedScale ? new THREE.Vector3(...savedScale) : mesh.scale.clone();
  if (!savedScale) mesh.userData.mediaBaseScale = baseScale.toArray();
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(16, 9, 0);
  size.set(Math.abs(size.x * baseScale.x), Math.abs(size.y * baseScale.y), Math.abs(size.z * baseScale.z));
  const axes = (["x", "y", "z"] as ScaleAxis[]).sort((left, right) => size[right] - size[left]);
  return { baseScale, size, widthAxis: axes[0], heightAxis: axes[1] };
}

function fitTextureToSurface(mesh: THREE.Mesh, texture: THREE.Texture, mediaAspect: number, fit: VideoFit, mirror = false) {
  const { baseScale, size, widthAxis, heightAxis } = mediaSurfaceDimensions(mesh);
  mesh.scale.copy(baseScale);
  const displayAspect = Math.max(0.01, size[widthAxis] / Math.max(0.01, size[heightAxis]));
  const safeMediaAspect = Math.max(0.01, mediaAspect || 16 / 9);
  let repeatX = 1;
  let repeatY = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === "contain") {
    if (safeMediaAspect > displayAspect) mesh.scale[heightAxis] *= displayAspect / safeMediaAspect;
    else mesh.scale[widthAxis] *= safeMediaAspect / displayAspect;
  } else if (safeMediaAspect > displayAspect) {
    repeatX = displayAspect / safeMediaAspect;
    offsetX = (1 - repeatX) / 2;
  } else {
    repeatY = safeMediaAspect / displayAspect;
    offsetY = (1 - repeatY) / 2;
  }

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(mirror ? -repeatX : repeatX, repeatY);
  texture.offset.set(mirror ? offsetX + repeatX : offsetX, offsetY);
  texture.needsUpdate = true;
  mesh.userData.mediaFit = fit;
  mesh.userData.mediaAspect = safeMediaAspect.toFixed(3);
  mesh.userData.displayAspect = displayAspect.toFixed(3);
}

function restoreMediaSurface(mesh: THREE.Mesh) {
  const savedScale = mesh.userData.mediaBaseScale as [number, number, number] | undefined;
  if (savedScale) mesh.scale.set(...savedScale);
  delete mesh.userData.mediaFit;
  delete mesh.userData.mediaAspect;
  delete mesh.userData.displayAspect;
}

function bindVideoElement(mesh: THREE.Mesh, video: HTMLVideoElement, mirror = false, owned = false, fit: VideoFit = "cover") {
  const { size, widthAxis, heightAxis } = mediaSurfaceDimensions(mesh);
  const displayAspect = Math.max(0.01, size[widthAxis] / Math.max(0.01, size[heightAxis]));
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = Math.max(1, Math.round(canvas.width / displayAspect));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The video compositor is unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const previous = mesh.material;
  const material = screenMaterial(texture);
  mesh.material = material;
  let stopped = false;
  let videoFrame = 0;
  let fallbackTimer = 0;
  const paintFrame = () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    const mediaAspect = video.videoWidth / video.videoHeight;
    let width = canvas.width;
    let height = canvas.height;
    if (fit === "contain") {
      if (mediaAspect > displayAspect) height = width / mediaAspect;
      else width = height * mediaAspect;
    } else if (mediaAspect > displayAspect) width = height * mediaAspect;
    else height = width / mediaAspect;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    context.fillStyle = "#02070d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    if (mirror) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, x, y, width, height);
    context.restore();
    texture.needsUpdate = true;
    mesh.userData.mediaFit = fit;
    mesh.userData.mediaAspect = mediaAspect.toFixed(3);
    mesh.userData.displayAspect = displayAspect.toFixed(3);
  };
  const scheduleVideoFrame = () => {
    if (stopped) return;
    videoFrame = video.requestVideoFrameCallback(() => {
      paintFrame();
      scheduleVideoFrame();
    });
  };
  if (typeof video.requestVideoFrameCallback === "function") scheduleVideoFrame();
  else fallbackTimer = window.setInterval(paintFrame, 33);
  video.addEventListener("loadedmetadata", paintFrame);
  video.addEventListener("seeked", paintFrame);
  paintFrame();
  void video.play().catch(() => undefined);
  return () => {
    stopped = true;
    if (videoFrame && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(videoFrame);
    if (fallbackTimer) window.clearInterval(fallbackTimer);
    video.removeEventListener("loadedmetadata", paintFrame);
    video.removeEventListener("seeked", paintFrame);
    if (owned) {
      video.pause();
      video.srcObject = null;
    }
    texture.dispose();
    material.dispose();
    if (mesh.material === material) mesh.material = previous;
    restoreMediaSurface(mesh);
  };
}

function bindStream(mesh: THREE.Mesh, stream: MediaStream, mirror = false, fit: VideoFit = "cover") {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  return bindVideoElement(mesh, video, mirror, true, fit);
}

function drawBrandSurface(canvas:HTMLCanvasElement, brand:"amx-air"|"amx-labs"|"dip"|"black", image:HTMLImageElement, elapsed=1) {
  const context=canvas.getContext("2d");
  if(!context)return;
  const width=canvas.width;const height=canvas.height;const progress=Math.min(1,elapsed/.82);const ease=1-Math.pow(1-progress,3);
  context.fillStyle="#02070d";context.fillRect(0,0,width,height);
  if(brand==="black")return;
  if(brand==="dip"){context.fillStyle=`rgba(5,12,17,${Math.sin(progress*Math.PI)})`;context.fillRect(0,0,width,height);return}
  const accent=brand==="amx-labs"?"#f4c96b":"#55e6ff";const secondary=brand==="amx-labs"?"#55e6ff":"#ff63de";
  context.globalAlpha=.16+.18*ease;
  if(image.complete&&image.naturalWidth){const aspect=image.naturalWidth/image.naturalHeight;const drawHeight=height*1.18;const drawWidth=drawHeight*aspect;context.drawImage(image,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight)}
  context.globalAlpha=1;
  const wipeX=(ease*1.35-.2)*width;
  context.fillStyle=accent;context.beginPath();context.moveTo(wipeX-width*.2,0);context.lineTo(wipeX,0);context.lineTo(wipeX-width*.28,height);context.lineTo(wipeX-width*.48,height);context.closePath();context.fill();
  context.fillStyle=secondary;context.fillRect(0,height*.82,width*ease,8);
  context.fillStyle="#f7fcff";context.textAlign="center";context.font=`800 ${Math.round(height*.13)}px Arial`;context.fillText(brand==="amx-labs"?"AMX LABS":"AMX AIR HUBS.CC",width/2,height*.52);
  context.fillStyle=accent;context.font=`800 ${Math.round(height*.035)}px Arial`;context.fillText(brand==="amx-labs"?"INNOVATION / PRODUCTION":"CREATE / CURATE / CONNECT",width/2,height*.61);
  context.textAlign="left";
}

function bindBrandSurface(mesh:THREE.Mesh, brand:"amx-air"|"amx-labs"|"dip"|"black", animated=false) {
  const {size,widthAxis,heightAxis}=mediaSurfaceDimensions(mesh);const aspect=Math.max(.01,size[widthAxis]/Math.max(.01,size[heightAxis]));
  const canvas=document.createElement("canvas");canvas.width=1280;canvas.height=Math.max(1,Math.round(canvas.width/aspect));
  const image=new Image();image.src="/brand/amx-air-hubs-brand.png";
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.minFilter=THREE.LinearFilter;
  const previous=mesh.material;const material=screenMaterial(texture);mesh.material=material;fitTextureToSurface(mesh,texture,aspect,"cover");
  const started=performance.now();let frame=0;
  const paint=()=>{drawBrandSurface(canvas,brand,image,animated?(performance.now()-started)/1000:1);texture.needsUpdate=true};
  paint();image.addEventListener("load",paint);if(animated)frame=window.setInterval(paint,33);
  return()=>{if(frame)window.clearInterval(frame);image.removeEventListener("load",paint);texture.dispose();material.dispose();if(mesh.material===material)mesh.material=previous;restoreMediaSurface(mesh)};
}

function bindLocationSurface(mesh:THREE.Mesh,data:LocationPanelData) {
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=768;drawLocationPanel(canvas,data);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
  const previous=mesh.material;const material=screenMaterial(texture);mesh.material=material;fitTextureToSurface(mesh,texture,canvas.width/canvas.height,"contain");
  const timer=window.setInterval(()=>{drawLocationPanel(canvas,data);texture.needsUpdate=true},1000);
  return()=>{window.clearInterval(timer);texture.dispose();material.dispose();if(mesh.material===material)mesh.material=previous;restoreMediaSurface(mesh)};
}

interface ScreenSourceBinding {
  streams: Array<MediaStream | null | undefined>;
  mediaElement?: HTMLVideoElement | null;
  runwayElement?: HTMLVideoElement | null;
  mediaFit: VideoFit;
  fitOverride?: VideoFit;
  locationPanel?: LocationPanelData | null;
}

function bindScreenSource(mesh: THREE.Mesh, source: ScreenSourceId, binding: ScreenSourceBinding) {
  if (source.startsWith("camera-")) {
    const stream = binding.streams[Number(source.slice(-1)) - 1];
    return stream
      ? bindStream(mesh, stream, source === "camera-1", binding.fitOverride || "cover")
      : bindBrandSurface(mesh, "amx-air");
  }
  if (source === "media") return binding.mediaElement
    ? bindVideoElement(mesh, binding.mediaElement, false, false, binding.fitOverride || binding.mediaFit)
    : bindBrandSurface(mesh, "amx-air");
  if (source === "runway") return binding.runwayElement
    ? bindVideoElement(mesh, binding.runwayElement, false, false, binding.fitOverride || "contain")
    : bindBrandSurface(mesh, "amx-labs");
  if (source === "map") return binding.locationPanel
    ? bindLocationSurface(mesh, binding.locationPanel)
    : bindBrandSurface(mesh, "amx-labs");
  if (source === "amx-air" || source === "amx-labs" || source === "black") return bindBrandSurface(mesh, source);
  return bindBrandSurface(mesh, "black");
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > width && line) {
      context.fillText(line, x, y + row * lineHeight);
      line = word;
      row += 1;
      if (row >= maxLines) return;
    } else line = candidate;
  }
  if (line && row < maxLines) context.fillText(line, x, y + row * lineHeight);
}

function drawLocationPanel(canvas: HTMLCanvasElement, data: LocationPanelData) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  context.fillStyle = "#030b10";
  context.fillRect(0, 0, width, canvas.height);
  context.fillStyle = "#0b222b";
  context.fillRect(0, 0, width, 92);
  context.fillStyle = "#55e6ff";
  context.fillRect(0, 0, 12, canvas.height);
  context.font = "700 28px Arial";
  context.fillText("GOOGLE LOCATION / LIVE CONTEXT", 38, 56);
  context.fillStyle = "#f4c96b";
  context.font = "700 50px Arial";
  wrapCanvasText(context, data.label.toUpperCase(), 38, 145, width - 76, 56, 2);
  context.fillStyle = "#b9d0d5";
  context.font = "28px Arial";
  wrapCanvasText(context, data.address, 38, 260, width - 76, 36, 3);
  context.strokeStyle = "#315762";
  context.beginPath();
  context.moveTo(38, 382);
  context.lineTo(width - 38, 382);
  context.stroke();
  context.fillStyle = "#55e6ff";
  context.font = "700 26px monospace";
  context.fillText(`${data.latitude.toFixed(6)} / ${data.longitude.toFixed(6)}`, 38, 430);
  context.fillStyle = "#718b91";
  context.font = "22px Arial";
  context.fillText(`ROOM ${data.roomCode}  |  ${new Date().toLocaleTimeString()}`, 38, 472);
  context.fillStyle = "#ff63de";
  context.font = "700 23px Arial";
  context.fillText(`AGENT CONTEXT / ${(data.agentTransport || "pending").toUpperCase()}`, 38, 528);
  context.fillStyle = "#d2e1e4";
  context.font = "24px Arial";
  wrapCanvasText(context, data.agentContext || "Select ASK AGENT to build a grounded workshop and digital-twin brief for this location.", 38, 574, width - 76, 34, 6);
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const record = material as THREE.Material & Record<string, unknown>;
      Object.values(record).forEach((value) => { if (value && typeof value === "object" && "isTexture" in value) (value as THREE.Texture).dispose(); });
      material.dispose();
    });
  });
}

async function applyZohundTextures(root: THREE.Object3D) {
  const loader = new THREE.TextureLoader();
  const [baseColor, metallicRoughness, normal] = await Promise.all([
    loader.loadAsync("/textures/zohund/base-color.png"),
    loader.loadAsync("/textures/zohund/metallic-roughness.png"),
    loader.loadAsync("/textures/zohund/normal.png"),
  ]);
  baseColor.colorSpace = THREE.SRGBColorSpace;
  [baseColor, metallicRoughness, normal].forEach((texture) => {
    texture.flipY = false;
    texture.needsUpdate = true;
  });
  const materials = new Set<THREE.MeshStandardMaterial>();
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => {
      if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.add(material as THREE.MeshStandardMaterial);
    });
  });
  materials.forEach((material) => {
    material.map = baseColor;
    material.normalMap = normal;
    material.roughnessMap = metallicRoughness;
    material.metalnessMap = metallicRoughness;
    material.needsUpdate = true;
  });
  return materials.size;
}

function addWorldCamera(scene: THREE.Scene, id: Exclude<WorldCameraId, "overview">, position: THREE.Vector3, target: THREE.Vector3) {
  const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.08, 40);
  camera.name = `WorldCamera_${id}`;
  const forward = target.clone().sub(position).normalize();
  camera.position.copy(position).addScaledVector(forward, 0.38);
  camera.lookAt(target);
  scene.add(camera);

  const rig = new THREE.Group();
  rig.name = `WorldCameraRig_${id}`;
  rig.position.copy(position);
  rig.quaternion.copy(camera.quaternion);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x172b34, metalness: 0.82, roughness: 0.24 });
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x071116, emissive: 0x55e6ff, emissiveIntensity: 4, metalness: 0.4, roughness: 0.12 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.42), bodyMaterial);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.09, 24), lensMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.25;
  const status = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7deea8 }));
  status.position.set(0.12, 0.08, -0.22);
  rig.add(body, lens, status);
  rig.traverse((child) => child.layers.set(WORLD_CAMERA_RIG_LAYER));
  scene.add(rig);
  return { camera, rig };
}

function anchorBeacon(anchor: GeoAnchor) {
  const group = new THREE.Group();
  group.name = `GeoAnchor_${anchor.id}`;
  const color = anchor.source === "webxr" ? 0x55e6ff : anchor.source === "map" ? 0xf4c96b : 0xff63de;
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3, metalness: 0.3, roughness: 0.22 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 40), material);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 10), material);
  mast.position.y = 0.35;
  group.add(mast);
  const point = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), material);
  point.position.y = 0.76;
  group.add(point);
  group.position.fromArray(anchor.localPosition);
  group.quaternion.fromArray(anchor.orientation);
  return group;
}

type NpcBoneName = "Head" | "Spine2" | "LeftArm" | "RightArm" | "LeftForeArm" | "RightForeArm";
type NpcRig = Partial<Record<NpcBoneName, { bone: THREE.Object3D; base: THREE.Quaternion }>>;

interface NpcSceneRuntime {
  root: THREE.Object3D | null;
  rig: NpcRig;
  target: THREE.Vector3;
  floorY: number;
  agentId: string;
  behavior: NpcRuntimeState["behavior"];
  action: NpcAction;
  actionUntil: number;
  arrivalAction: Exclude<NpcAction, "idle" | "walk"> | null;
  moving: boolean;
  waypoint: NpcRuntimeState["waypoint"];
  speed: number;
  patrolIndex: number;
  patrolResumeAt: number;
  lastCommandId: string;
  lastReportAt: number;
  lastReportKey: string;
}

const NPC_PATROL: NpcWaypointId[] = ["entry", "stage", "media", "briefing", "rack"];

function captureNpcRig(root: THREE.Object3D): NpcRig {
  const rig: NpcRig = {};
  (["Head", "Spine2", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"] as NpcBoneName[]).forEach((name) => {
    const bone = root.getObjectByName(name);
    if (bone) rig[name] = { bone, base: bone.quaternion.clone() };
  });
  return rig;
}

function poseNpcBone(rig: NpcRig, name: NpcBoneName, x = 0, y = 0, z = 0) {
  const pose = rig[name];
  if (!pose) return;
  pose.bone.quaternion.copy(pose.base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
}

function animateNpcRig(npc: NpcSceneRuntime, elapsed: number, reducedMotion = false) {
  const root = npc.root;
  if (!root) return;
  const cycle = elapsed * 7.5;
  const walkSwing = reducedMotion ? 0 : Math.sin(cycle) * 0.42;
  root.position.y = npc.floorY + (npc.action === "walk" && !reducedMotion ? Math.abs(Math.sin(cycle)) * 0.025 : 0);
  poseNpcBone(npc.rig, "Head");
  poseNpcBone(npc.rig, "Spine2", reducedMotion ? 0 : Math.sin(elapsed * 1.8) * 0.012);
  poseNpcBone(npc.rig, "LeftArm", npc.action === "walk" ? walkSwing : 0);
  poseNpcBone(npc.rig, "RightArm", npc.action === "walk" ? -walkSwing : 0);
  poseNpcBone(npc.rig, "LeftForeArm", npc.action === "walk" ? Math.max(0, -walkSwing) * 0.26 : 0);
  poseNpcBone(npc.rig, "RightForeArm", npc.action === "walk" ? Math.max(0, walkSwing) * 0.26 : 0);
  if (reducedMotion) return;
  if (npc.action === "wave") {
    poseNpcBone(npc.rig, "RightArm", -0.35, 0, -1.15);
    poseNpcBone(npc.rig, "RightForeArm", -0.75 + Math.sin(elapsed * 8) * 0.28, 0, -0.18);
  } else if (npc.action === "talk") {
    poseNpcBone(npc.rig, "Head", 0, Math.sin(elapsed * 2.4) * 0.09);
    poseNpcBone(npc.rig, "LeftForeArm", -0.32 + Math.sin(elapsed * 3.5) * 0.1, 0, -0.15);
    poseNpcBone(npc.rig, "RightForeArm", -0.32 - Math.sin(elapsed * 3.5) * 0.1, 0, 0.15);
  } else if (npc.action === "inspect") {
    poseNpcBone(npc.rig, "Head", 0.23, Math.sin(elapsed * 1.5) * 0.16);
    poseNpcBone(npc.rig, "Spine2", 0.11, Math.sin(elapsed * 1.5) * 0.06);
  }
}

function clampNpcTarget(target: THREE.Vector3) {
  target.x = THREE.MathUtils.clamp(target.x, -4.25, 4.25);
  target.y = 0;
  target.z = THREE.MathUtils.clamp(target.z, -3.65, 3.45);
  return target;
}

function setNpcTarget(npc: NpcSceneRuntime, position: [number, number, number] | THREE.Vector3, waypoint: NpcRuntimeState["waypoint"] = "custom") {
  npc.target.copy(position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position));
  clampNpcTarget(npc.target);
  npc.waypoint = waypoint;
  npc.actionUntil = 0;
  npc.arrivalAction = null;
}

function nudgeNpc(npc: NpcSceneRuntime, direction: NpcDirection) {
  const origin = npc.root?.position || npc.target;
  const offset = direction === "forward" ? new THREE.Vector3(0, 0, -0.8)
    : direction === "back" ? new THREE.Vector3(0, 0, 0.8)
      : direction === "left" ? new THREE.Vector3(-0.8, 0, 0)
        : new THREE.Vector3(0.8, 0, 0);
  setNpcTarget(npc, origin.clone().add(offset), "custom");
  npc.behavior = "hold";
}

function npcSnapshot(npc: NpcSceneRuntime): NpcRuntimeState {
  const position = npc.root?.position || npc.target;
  return {
    agentId: npc.agentId,
    behavior: npc.behavior,
    action: npc.action,
    moving: npc.moving,
    waypoint: npc.waypoint,
    position: [Number(position.x.toFixed(2)), 0, Number(position.z.toFixed(2))],
    speed: Number(npc.speed.toFixed(1)),
  };
}

export function NexusRoomScene({ localStream, sceneStreams = [], mediaElement, runwayElement, mediaFit = "contain", screenProgram, screenStinger, screenMode = "triple", screenWallSource = "amx-air", screenWallFit = "contain", screenWallFormat = "production", locationPanel, anchors, lightPreset, vfxPreset = "ambient", globeLevel = "center", xrMode = "none", reducedMotion, avatarUrl, npcCommand, activeWorldCamera = "overview", cameraControl = DEFAULT_WORLD_CAMERA_CONTROL, onReady, onBackend, onCaptureReady, onAvatarState, onNpcState }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const screenRefs = useRef<Record<ScreenName, THREE.Mesh | null>>({ Screen_User: null, Screen_Agent_Left: null, Screen_Agent_Right: null });
  const screenWallRef = useRef<THREE.Mesh | null>(null);
  const lightRefs = useRef<THREE.Light[]>([]);
  const hologramTargetsRef = useRef<Array<{ object: THREE.Object3D; baseY: number }>>([]);
  const vfxRuntimeRef = useRef<NexusVfxRuntime | null>(null);
  const anchorLayerRef = useRef<THREE.Group | null>(null);
  const avatarRef = useRef<THREE.Object3D | null>(null);
  const npcRuntimeRef = useRef<NpcSceneRuntime>({
    root: null,
    rig: {},
    target: new THREE.Vector3(...DEFAULT_NPC_STATE.position),
    floorY: 0,
    agentId: DEFAULT_NPC_STATE.agentId,
    behavior: DEFAULT_NPC_STATE.behavior,
    action: DEFAULT_NPC_STATE.action,
    actionUntil: 0,
    arrivalAction: null,
    moving: false,
    waypoint: DEFAULT_NPC_STATE.waypoint,
    speed: DEFAULT_NPC_STATE.speed,
    patrolIndex: 0,
    patrolResumeAt: 0,
    lastCommandId: "",
    lastReportAt: 0,
    lastReportKey: "",
  });
  const activeCameraRef = useRef<WorldCameraId>(activeWorldCamera);
  const cameraControlRef = useRef<WorldCameraControl>(normalizeWorldCameraControl(cameraControl));
  const vfxPresetRef = useRef<NexusVfxPreset>(vfxPreset);
  const globeLevelRef = useRef<NexusGlobeLevel>(globeLevel);
  const startXRRef = useRef<() => Promise<void>>(async () => undefined);
  const endXRRef = useRef<() => Promise<void>>(async () => undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [xrState, setXrState] = useState<"preview" | "entering" | "live" | "error">("preview");
  const [xrMessage, setXrMessage] = useState("");
  const onReadyRef = useRef(onReady);
  const onBackendRef = useRef(onBackend);
  const onCaptureReadyRef = useRef(onCaptureReady);
  const onAvatarStateRef = useRef(onAvatarState);
  const onNpcStateRef = useRef(onNpcState);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onBackendRef.current = onBackend; }, [onBackend]);
  useEffect(() => { onCaptureReadyRef.current = onCaptureReady; }, [onCaptureReady]);
  useEffect(() => { onAvatarStateRef.current = onAvatarState; }, [onAvatarState]);
  useEffect(() => { onNpcStateRef.current = onNpcState; }, [onNpcState]);
  useEffect(() => { activeCameraRef.current = activeWorldCamera; }, [activeWorldCamera]);
  useEffect(() => { cameraControlRef.current = normalizeWorldCameraControl(cameraControl); }, [cameraControl]);
  useEffect(() => { vfxPresetRef.current = vfxPreset; }, [vfxPreset]);
  useEffect(() => { globeLevelRef.current = globeLevel; }, [globeLevel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = xrMode === "mr" ? null : new THREE.Color(0x02070d);
    scene.fog = new THREE.FogExp2(0x02070d, 0.025);
    const initialAspect = host.clientWidth / Math.max(1, host.clientHeight);
    const camera = new THREE.PerspectiveCamera(responsiveRoomFov(initialAspect), initialAspect, 0.05, 100);
    camera.position.set(0, 4.15, 9.4);
    const renderer = new THREE.WebGPURenderer({
      antialias: true,
      alpha: xrMode === "mr",
      powerPreference: "high-performance",
      forceWebGL: xrMode !== "none" || forceWebGLDiagnostic(),
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.xr.enabled = xrMode !== "none";
    if (xrMode !== "none") renderer.xr.setReferenceSpaceType("local-floor");
    renderer.domElement.className = "nexus-room-canvas";
    host.appendChild(renderer.domElement);
    const playerRig = new THREE.Group();
    playerRig.name = "Nexus_XR_Player_Rig";
    playerRig.add(camera);
    scene.add(playerRig);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.55, -1.2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 4.8;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotate = false;
    const worldCameras = new Map<WorldCameraId, ReturnType<typeof addWorldCamera>>();
    (Object.entries(WORLD_CAMERA_POSES) as Array<[Exclude<WorldCameraId, "overview">, (typeof WORLD_CAMERA_POSES)[Exclude<WorldCameraId, "overview">]]>).forEach(([id, pose]) => {
      worldCameras.set(id, addWorldCamera(scene, id, new THREE.Vector3(...pose.position), new THREE.Vector3(...pose.target)));
    });
    scene.add(new THREE.HemisphereLight(0x8cdfff, 0x02070c, 0.7));
    const runtimeKey = new THREE.DirectionalLight(0x9eefff, 1.8);
    runtimeKey.position.set(-4, 8, 5);
    runtimeKey.userData.baseIntensity = runtimeKey.intensity;
    scene.add(runtimeKey);
    lightRefs.current = [runtimeKey];
    const anchorLayer = new THREE.Group();
    anchorLayer.name = "Realtime_Geo_Anchors";
    anchorLayerRef.current = anchorLayer;
    scene.add(anchorLayer);
    const xrControllers = xrMode === "none" ? [] : [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      controller.add(controllerRay(index === 0 ? 0x55e6ff : 0xff55d7));
      playerRig.add(controller);
      return controller;
    });
    let xrSession: XRSession | null = null;
    let snapTurnReady = true;

    startXRRef.current = async () => {
      const xr = (navigator as Navigator & { xr?: { isSessionSupported: (kind: string) => Promise<boolean>; requestSession: (kind: string, options: unknown) => Promise<XRSession> } }).xr;
      const sessionMode = xrMode === "vr" ? "immersive-vr" : "immersive-ar";
      setXrState("entering");
      setXrMessage("");
      try {
        if (xrMode === "none" || !xr || !(await xr.isSessionSupported(sessionMode))) throw new Error(`${sessionMode} is unavailable in this browser`);
        const session = await xr.requestSession(sessionMode, {
          requiredFeatures: ["local-floor"],
          optionalFeatures: ["bounded-floor", "hand-tracking", "layers", "dom-overlay"],
          domOverlay: { root: document.body },
        });
        xrSession = session;
        playerRig.position.set(0, 0, xrMode === "mr" ? 4.2 : 5.6);
        playerRig.rotation.set(0, 0, 0);
        await renderer.xr.setSession(session);
        host.dataset.xrSession = "live";
        setXrState("live");
        session.addEventListener("end", () => {
          xrSession = null;
          playerRig.position.set(0, 0, 0);
          camera.position.set(0, 4.15, 9.4);
          lastCameraControl = "";
          host.dataset.xrSession = "ended";
          setXrState("preview");
        }, { once: true });
      } catch (sessionError) {
        host.dataset.xrSession = "error";
        setXrMessage(sessionError instanceof Error ? sessionError.message : "Nexus WebXR could not start");
        setXrState("error");
      }
    };
    endXRRef.current = async () => { if (xrSession) await xrSession.end(); };

    let model: THREE.Object3D | null = null;
    const loader = new GLTFLoader();
    loader.load("/models/nexus-control-room.glb", (gltf) => {
      model = gltf.scene;
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.name in screenRefs.current) screenRefs.current[mesh.name as ScreenName] = mesh;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            const lit = material as THREE.MeshStandardMaterial;
            if (typeof lit.emissiveIntensity === "number") lit.emissiveIntensity = Math.min(lit.emissiveIntensity, 1.8);
          });
        }
        if ((child as THREE.Light).isLight) {
          const light = child as THREE.Light;
          const normalizedIntensity = (light as THREE.PointLight).isPointLight ? Math.min(light.intensity, 85) : Math.min(light.intensity, 6);
          light.intensity = normalizedIntensity;
          light.userData.baseIntensity = normalizedIntensity;
          lightRefs.current.push(light);
        }
      });
      (Object.keys(screenRefs.current) as ScreenName[]).forEach((name) => {
        const target = model?.getObjectByName(name);
        screenRefs.current[name] = target && (target as THREE.Mesh).isMesh ? target as THREE.Mesh : null;
      });
      scene.add(model);
      const hologramObjects = ["Nexus_Hologram", "HoloOrbit_A", "HoloOrbit_B", "HoloOrbit_C"]
        .map((name) => model?.getObjectByName(name))
        .filter(Boolean) as THREE.Object3D[];
      hologramTargetsRef.current = hologramObjects.map((object) => ({ object, baseY: object.position.y }));
      const hologram = model.getObjectByName("Nexus_Hologram");
      if (hologram) {
        const vfxRuntime = createHologramParticles(hologram.getWorldPosition(new THREE.Vector3()));
        vfxRuntimeRef.current = vfxRuntime;
        scene.add(vfxRuntime.group);
        host.dataset.vfxParticles = String(NEXUS_VFX_PARTICLES.ambient);
      }
      const screenMeshes = (Object.values(screenRefs.current).filter(Boolean) as THREE.Mesh[]);
      if (screenMeshes.length === 3) {
        const wallBounds = new THREE.Box3();
        screenMeshes.forEach((mesh) => wallBounds.union(new THREE.Box3().setFromObject(mesh)));
        const wallSize = wallBounds.getSize(new THREE.Vector3());
        const wallCenter = wallBounds.getCenter(new THREE.Vector3());
        const wallWidth = wallSize.x + 0.18;
        const wallHeight = wallWidth / SCREEN_WALL_FORMATS.production.aspect;
        const wallGeometry = new THREE.PlaneGeometry(wallWidth, wallHeight);
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x02070d, toneMapped: false, side: THREE.DoubleSide });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.name = "Screen_Wall";
        wall.position.set(wallCenter.x, wallCenter.y, wallBounds.max.z + 0.045);
        wall.rotation.set(0, Math.PI, Math.PI);
        wall.renderOrder = 5;
        wall.visible = false;
        wall.userData.wallWidth = wallWidth;
        scene.add(wall);
        screenWallRef.current = wall;
        host.dataset.screenWall = `${wallWidth.toFixed(2)}x${wallHeight.toFixed(2)}`;
      }
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      host.dataset.modelBounds = `${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
      host.dataset.modelCenter = `${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}`;
      host.dataset.modelRange = `${bounds.min.z.toFixed(2)}:${bounds.max.z.toFixed(2)}`;
      host.dataset.screenTargets = (Object.keys(screenRefs.current) as ScreenName[]).filter((name) => Boolean(screenRefs.current[name])).join(",");
      setLoading(false);
      onReadyRef.current?.();
    }, undefined, (loadError) => {
      setLoading(false);
      setError(loadError instanceof Error ? loadError.message : "The Blender room could not be loaded");
    });

    const clock = new THREE.Clock();
    const captureFrame = new URLSearchParams(window.location.search).get("capture") === "1";
    let frame = 0;
    let lastWorldCamera: WorldCameraId = "overview";
    let lastCameraControl = "";
    let previousElapsed = 0;
    const worldUp = new THREE.Vector3(0, 1, 0);
    const xrForward = new THREE.Vector3();
    const xrRight = new THREE.Vector3();
    const panQuaternion = new THREE.Quaternion();
    const render = () => {
      const currentFrame = frame++;
      host.dataset.frames = String(currentFrame);
      const elapsed = clock.getElapsedTime();
      const wallSeconds = performance.now() / 1000;
      const delta = Math.min(0.05, Math.max(0.001, elapsed - previousElapsed));
      previousElapsed = elapsed;
      const selectedCamera = activeCameraRef.current;
      const currentControl = cameraControlRef.current;
      const cameraControlKey = `${selectedCamera}:${currentControl.pan}:${currentControl.tilt}:${currentControl.zoom}`;
      if (!renderer.xr.isPresenting && (selectedCamera !== lastWorldCamera || cameraControlKey !== lastCameraControl)) {
        if (selectedCamera === "overview") {
          if (selectedCamera !== lastWorldCamera) camera.position.set(0, 4.15, 9.4);
          controls.target.set(currentControl.pan / 15, 1.55 + currentControl.tilt / 16, -1.2);
          controls.enabled = true;
          controls.autoRotate = false;
          camera.fov = THREE.MathUtils.clamp(responsiveRoomFov(camera.aspect) / currentControl.zoom, 24, 72);
        } else {
          const selected = worldCameras.get(selectedCamera);
          if (selected) {
            camera.position.copy(selected.camera.position);
            camera.quaternion.copy(selected.camera.quaternion);
            panQuaternion.setFromAxisAngle(worldUp, THREE.MathUtils.degToRad(-currentControl.pan));
            camera.quaternion.premultiply(panQuaternion);
            camera.rotateX(THREE.MathUtils.degToRad(currentControl.tilt));
            camera.fov = THREE.MathUtils.clamp(54 / currentControl.zoom, 24, 72);
            camera.updateMatrixWorld();
            selected.rig.quaternion.copy(camera.quaternion);
          }
          controls.enabled = false;
          controls.autoRotate = false;
        }
        lastWorldCamera = selectedCamera;
        lastCameraControl = cameraControlKey;
        host.dataset.worldCamera = selectedCamera;
        host.dataset.cameraPan = String(currentControl.pan);
        host.dataset.cameraTilt = String(currentControl.tilt);
        host.dataset.cameraZoom = currentControl.zoom.toFixed(1);
        camera.updateProjectionMatrix();
      }
      if (renderer.xr.isPresenting && xrSession) {
        controls.enabled = false;
        camera.getWorldDirection(xrForward);
        xrForward.y = 0;
        if (xrForward.lengthSq() > 0.001) xrForward.normalize();
        xrRight.crossVectors(xrForward, worldUp).normalize();
        Array.from(xrSession.inputSources).forEach((source) => {
          const axes = source.gamepad?.axes || [];
          const axisX = Math.abs(axes[2] || 0) > Math.abs(axes[0] || 0) ? axes[2] || 0 : axes[0] || 0;
          const axisY = Math.abs(axes[3] || 0) > Math.abs(axes[1] || 0) ? axes[3] || 0 : axes[1] || 0;
          if (source.handedness === "left") {
            if (Math.abs(axisY) > 0.18) playerRig.position.addScaledVector(xrForward, -axisY * delta * 2.2);
            if (Math.abs(axisX) > 0.18) playerRig.position.addScaledVector(xrRight, axisX * delta * 2.2);
          }
          if (source.handedness === "right") {
            if (Math.abs(axisX) > 0.72 && snapTurnReady) {
              playerRig.rotation.y -= Math.sign(axisX) * THREE.MathUtils.degToRad(30);
              snapTurnReady = false;
            } else if (Math.abs(axisX) < 0.32) snapTurnReady = true;
          }
        });
        host.dataset.xrInputSources = String(xrSession.inputSources.length);
        host.dataset.xrLocomotion = `${playerRig.position.x.toFixed(2)},${playerRig.position.z.toFixed(2)},${THREE.MathUtils.radToDeg(playerRig.rotation.y).toFixed(0)}`;
      } else controls.update();
      const vfx = vfxRuntimeRef.current;
      if (vfx) {
        const preset = vfxPresetRef.current;
        const targetShift = NEXUS_GLOBE_LEVELS[globeLevelRef.current].offset;
        vfx.currentShift = reducedMotion ? targetShift : THREE.MathUtils.lerp(vfx.currentShift, targetShift, Math.min(1, delta * 4.2));
        hologramTargetsRef.current.forEach(({ object, baseY }) => { object.position.y = baseY + vfx.currentShift; });
        vfx.group.position.y = vfx.basePosition.y + vfx.currentShift;
        vfx.group.visible = preset !== "off";
        const particleCount = preset === "show" ? NEXUS_VFX_PARTICLES.show : NEXUS_VFX_PARTICLES.ambient;
        vfx.geometry.setDrawRange(0, particleCount);
        vfx.material.opacity = preset === "show" ? 0.92 : 0.62;
        vfx.material.size = preset === "show" ? 0.065 : 0.042;
        if (preset !== "off" && !reducedMotion) {
          const speed = preset === "show" ? 1.15 : 0.42;
          for (let index = 0; index < particleCount; index += 1) {
            const seedOffset = index * 4;
            const positionOffset = index * 3;
            const angle = vfx.seeds[seedOffset] + elapsed * speed * (0.36 + (index % 7) * 0.025);
            const pulse = 1 + Math.sin(elapsed * (preset === "show" ? 3.1 : 1.4) + vfx.seeds[seedOffset + 3]) * (preset === "show" ? 0.12 : 0.04);
            const radius = vfx.seeds[seedOffset + 1] * pulse;
            vfx.positions[positionOffset] = Math.cos(angle) * radius;
            vfx.positions[positionOffset + 1] = vfx.seeds[seedOffset + 2] + Math.sin(angle * 1.7 + vfx.seeds[seedOffset + 3]) * 0.16;
            vfx.positions[positionOffset + 2] = Math.sin(angle) * radius;
          }
          (vfx.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        }
        host.dataset.vfxPreset = preset;
        host.dataset.vfxParticles = String(preset === "off" ? 0 : particleCount);
        host.dataset.globeLevel = globeLevelRef.current;
        host.dataset.globeOffset = vfx.currentShift.toFixed(2);
      }
      if (model && !reducedMotion) {
        const hologram = model.getObjectByName("Nexus_Hologram");
        if (hologram) hologram.rotation.y = elapsed * 0.3;
        ["HoloOrbit_A", "HoloOrbit_B", "HoloOrbit_C"].forEach((name, index) => {
          const orbit = model?.getObjectByName(name);
          if (orbit) orbit.rotation.z += 0.0015 * (index % 2 ? -1 : 1);
        });
      }
      const npc = npcRuntimeRef.current;
      if (npc.root) {
        const dx = npc.target.x - npc.root.position.x;
        const dz = npc.target.z - npc.root.position.z;
        const distance = Math.hypot(dx, dz);
        const wasMoving = npc.moving;
        npc.moving = distance > 0.04;
        if (npc.moving) {
          const step = Math.min(distance, npc.speed * delta);
          npc.root.position.x += dx / distance * step;
          npc.root.position.z += dz / distance * step;
          const desiredYaw = Math.atan2(dx, dz);
          const yawDelta = Math.atan2(Math.sin(desiredYaw - npc.root.rotation.y), Math.cos(desiredYaw - npc.root.rotation.y));
          npc.root.rotation.y += yawDelta * Math.min(1, delta * 9);
          npc.action = "walk";
        } else {
          if (wasMoving) {
            npc.patrolResumeAt = elapsed + 1.35;
            if (npc.arrivalAction) {
              npc.action = npc.arrivalAction;
              npc.actionUntil = wallSeconds + (npc.action === "talk" ? 4.5 : 3.2);
              npc.arrivalAction = null;
            }
          }
          if (npc.actionUntil > wallSeconds) {
            // Keep the requested one-shot pose until its timer expires.
          } else npc.action = "idle";
          if (npc.behavior === "patrol" && npc.action === "idle" && elapsed >= npc.patrolResumeAt) {
            npc.patrolIndex = (npc.patrolIndex + 1) % NPC_PATROL.length;
            const nextWaypoint = waypointFor(NPC_PATROL[npc.patrolIndex]);
            if (nextWaypoint) setNpcTarget(npc, nextWaypoint.position, nextWaypoint.id);
          }
        }
        animateNpcRig(npc, elapsed, reducedMotion);
        if (elapsed - npc.lastReportAt >= 0.35 || currentFrame < 3) {
          npc.lastReportAt = elapsed;
          const snapshot = npcSnapshot(npc);
          host.dataset.npcAction = snapshot.action;
          host.dataset.npcBehavior = snapshot.behavior;
          host.dataset.npcMoving = String(snapshot.moving);
          host.dataset.npcWaypoint = snapshot.waypoint || "none";
          host.dataset.npcPosition = snapshot.position.join(",");
          const reportKey = JSON.stringify(snapshot);
          if (reportKey !== npc.lastReportKey) {
            npc.lastReportKey = reportKey;
            onNpcStateRef.current?.(snapshot);
          }
        }
      }
      renderer.render(scene, camera);
      if (captureFrame || currentFrame % 30 === 0) {
        host.dataset.drawCalls = String(renderer.info.render.drawCalls);
        host.dataset.triangles = String(renderer.info.render.triangles);
        const mediaScreen = screenRefs.current.Screen_Agent_Left;
        if (mediaScreen?.userData.mediaFit) {
          host.dataset.videoFit = String(mediaScreen.userData.mediaFit);
          host.dataset.videoAspect = String(mediaScreen.userData.mediaAspect);
          host.dataset.videoDisplayAspect = String(mediaScreen.userData.displayAspect);
        } else {
          delete host.dataset.videoFit;
          delete host.dataset.videoAspect;
          delete host.dataset.videoDisplayAspect;
        }
      }
    };
    let animationFrame = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      render();
      if (!captureFrame || !model || frame < 3) animationFrame = requestAnimationFrame(animate);
    };
    void renderer.init().then(() => {
      if (disposed) return;
      const backend = getRendererBackend(renderer);
      host.dataset.renderer = backend;
      onBackendRef.current?.(backend);
      onCaptureReadyRef.current?.(async (requestedCamera = activeCameraRef.current) => {
        if (disposed) return null;
        const requested = worldCameras.get(requestedCamera);
        const captureCamera = requestedCamera === activeCameraRef.current ? camera : requested?.camera || camera;
        renderer.render(scene, captureCamera);
        return new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, "image/jpeg", 0.86));
      });
      if (xrMode === "none") animate();
      else renderer.setAnimationLoop(render);
    }).catch((initError: unknown) => {
      if (disposed) return;
      setLoading(false);
      setError(initError instanceof Error ? initError.message : "The GPU renderer could not be initialized");
    });
    const resize = () => {
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      const control = cameraControlRef.current;
      camera.fov = THREE.MathUtils.clamp((activeCameraRef.current === "overview" ? responsiveRoomFov(camera.aspect) : 54) / control.zoom, 24, 72);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const walkPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const walkTarget = new THREE.Vector3();
    const moveNpcFromPointer = (event: MouseEvent) => {
      if (!npcRuntimeRef.current.root) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(walkPlane, walkTarget)) return;
      const npc = npcRuntimeRef.current;
      npc.behavior = "hold";
      setNpcTarget(npc, walkTarget, "custom");
    };
    const focusNpcControls = () => host.focus({ preventScroll: true });
    const moveNpcFromKey = (event: KeyboardEvent) => {
      const direction = event.key === "ArrowUp" || event.key.toLowerCase() === "w" ? "forward"
        : event.key === "ArrowDown" || event.key.toLowerCase() === "s" ? "back"
          : event.key === "ArrowLeft" || event.key.toLowerCase() === "a" ? "left"
            : event.key === "ArrowRight" || event.key.toLowerCase() === "d" ? "right" : null;
      if (!direction || !npcRuntimeRef.current.root) return;
      event.preventDefault();
      nudgeNpc(npcRuntimeRef.current, direction);
    };
    host.tabIndex = 0;
    renderer.domElement.addEventListener("pointerdown", focusNpcControls);
    renderer.domElement.addEventListener("dblclick", moveNpcFromPointer);
    host.addEventListener("keydown", moveNpcFromKey);
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", focusNpcControls);
      renderer.domElement.removeEventListener("dblclick", moveNpcFromPointer);
      host.removeEventListener("keydown", moveNpcFromKey);
      controls.dispose();
      renderer.setAnimationLoop(null);
      if (xrSession) void xrSession.end().catch(() => undefined);
      xrControllers.forEach((controller) => controller.traverse((object) => {
        if ((object as THREE.Line).isLine) {
          (object as THREE.Line).geometry.dispose();
          ((object as THREE.Line).material as THREE.Material).dispose();
        }
      }));
      void renderer.dispose();
      onCaptureReadyRef.current?.(null);
      if (avatarRef.current) disposeObject(avatarRef.current);
      if (vfxRuntimeRef.current) {
        vfxRuntimeRef.current.geometry.dispose();
        vfxRuntimeRef.current.material.dispose();
      }
      avatarRef.current = null;
      vfxRuntimeRef.current = null;
      hologramTargetsRef.current = [];
      sceneRef.current = null;
      anchorLayerRef.current = null;
      screenWallRef.current = null;
      screenRefs.current = { Screen_User: null, Screen_Agent_Left: null, Screen_Agent_Right: null };
      lightRefs.current = [];
      startXRRef.current = async () => undefined;
      endXRRef.current = async () => undefined;
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [reducedMotion, xrMode]);

  useEffect(() => {
    if (!npcCommand) return;
    const npc = npcRuntimeRef.current;
    if (npc.lastCommandId === npcCommand.id) return;
    npc.lastCommandId = npcCommand.id;
    npc.agentId = npcCommand.agentId || npc.agentId;
    if (npcCommand.kind === "move") {
      const waypoint = waypointFor(npcCommand.waypoint);
      const position = npcCommand.position || waypoint?.position;
      if (position) setNpcTarget(npc, position, waypoint?.id || "custom");
      npc.arrivalAction = npcCommand.arrivalAction || null;
      npc.behavior = "hold";
    } else if (npcCommand.kind === "nudge" && npcCommand.direction) nudgeNpc(npc, npcCommand.direction);
    else if (npcCommand.kind === "action") {
      npc.behavior = "hold";
      npc.target.copy(npc.root?.position || npc.target);
      npc.action = npcCommand.action || "talk";
      npc.arrivalAction = null;
      npc.actionUntil = performance.now() / 1000 + (npc.action === "talk" ? 4.5 : 3.2);
    } else if (npcCommand.kind === "behavior") {
      npc.behavior = npcCommand.behavior || "hold";
      npc.actionUntil = 0;
      if (npc.behavior === "patrol") {
        npc.patrolIndex = -1;
        npc.patrolResumeAt = 0;
      }
    } else if (npcCommand.kind === "speed") npc.speed = THREE.MathUtils.clamp(npcCommand.speed || npc.speed, 0.5, 2.2);
    else if (npcCommand.kind === "stop") {
      npc.behavior = "hold";
      npc.target.copy(npc.root?.position || npc.target);
      npc.action = "idle";
      npc.actionUntil = 0;
      npc.arrivalAction = null;
    } else if (npcCommand.kind === "reset") {
      const stage = waypointFor("stage");
      if (stage) setNpcTarget(npc, stage.position, stage.id);
      npc.behavior = "hold";
      npc.speed = DEFAULT_NPC_STATE.speed;
    }
    const snapshot = npcSnapshot(npc);
    if (hostRef.current) {
      hostRef.current.dataset.npcAction = snapshot.action;
      hostRef.current.dataset.npcBehavior = snapshot.behavior;
      hostRef.current.dataset.npcWaypoint = snapshot.waypoint || "none";
    }
    onNpcStateRef.current?.(snapshot);
  }, [npcCommand]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const npc = npcRuntimeRef.current;
    const previousPosition = avatarRef.current?.position.clone();
    if (avatarRef.current) {
      scene.remove(avatarRef.current);
      disposeObject(avatarRef.current);
      avatarRef.current = null;
    }
    npc.root = null;
    npc.rig = {};
    const host = hostRef.current;
    if (host) {
      host.dataset.avatar = avatarUrl ? "loading" : "idle";
      delete host.dataset.avatarBounds;
    }
    if (!avatarUrl) {
      onAvatarStateRef.current?.("idle");
      return;
    }
    let cancelled = false;
    onAvatarStateRef.current?.("loading");
    const loader = new GLTFLoader();
    loader.load(avatarUrl, async (gltf) => {
      if (cancelled || !sceneRef.current) {
        disposeObject(gltf.scene);
        return;
      }
      const avatar = gltf.scene;
      avatar.name = "ZOHUND_Avatar";
      let externalMaterialCount = 0;
      if (avatarUrl === "/models/zohund-avatar.glb") {
        try { externalMaterialCount = await applyZohundTextures(avatar); } catch { externalMaterialCount = 0; }
      }
      if (cancelled || !sceneRef.current) {
        disposeObject(avatar);
        return;
      }
      const bounds = new THREE.Box3().setFromObject(avatar);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = size.y > 0 ? 1.78 / size.y : 1;
      avatar.scale.setScalar(scale);
      const scaledBounds = new THREE.Box3().setFromObject(avatar);
      const scaledSize = scaledBounds.getSize(new THREE.Vector3());
      const start = previousPosition || npc.target;
      npc.floorY = -scaledBounds.min.y;
      avatar.position.set(start.x, npc.floorY, start.z);
      avatar.rotation.y = Math.PI;
      sceneRef.current.add(avatar);
      avatarRef.current = avatar;
      npc.root = avatar;
      npc.rig = captureNpcRig(avatar);
      npc.moving = Math.hypot(npc.target.x - avatar.position.x, npc.target.z - avatar.position.z) > 0.04;
      if (hostRef.current) {
        hostRef.current.dataset.avatar = "ready";
        hostRef.current.dataset.avatarBounds = `${scaledSize.x.toFixed(2)}x${scaledSize.y.toFixed(2)}x${scaledSize.z.toFixed(2)}`;
        hostRef.current.dataset.avatarMaterials = String(externalMaterialCount);
      }
      onNpcStateRef.current?.(npcSnapshot(npc));
      onAvatarStateRef.current?.("ready");
    }, undefined, () => {
      if (!cancelled) {
        if (hostRef.current) hostRef.current.dataset.avatar = "error";
        onAvatarStateRef.current?.("error");
      }
    });
    return () => { cancelled = true; };
  }, [avatarUrl, loading]);

  useEffect(() => {
    const intensity = lightPreset === "focus" ? 1.45 : lightPreset === "standby" ? 0.42 : 1;
    lightRefs.current.forEach((light) => { light.intensity = Number(light.userData.baseIntensity || light.intensity) * intensity; });
  }, [lightPreset, loading]);

  useEffect(() => {
    const layer = anchorLayerRef.current;
    if (!layer) return;
    layer.clear();
    anchors.slice(-24).forEach((anchor) => {
      const beacon = anchorBeacon(anchor);
      beacon.position.multiplyScalar(0.16);
      beacon.position.y = Math.max(0.2, beacon.position.y);
      beacon.position.z += 0.5;
      layer.add(beacon);
    });
  }, [anchors, loading]);

  useEffect(() => {
    const wall = screenWallRef.current;
    const host = hostRef.current;
    if (!wall || !host) return;
    const wallWidth = Number(wall.userData.wallWidth) || 9.27;
    const wallHeight = wallWidth / SCREEN_WALL_FORMATS[screenWallFormat].aspect;
    wall.geometry.dispose();
    wall.geometry = new THREE.PlaneGeometry(wallWidth, wallHeight);
    host.dataset.screenWall = `${wallWidth.toFixed(2)}x${wallHeight.toFixed(2)}`;
    host.dataset.screenWallFormat = screenWallFormat;
  }, [loading, screenWallFormat]);

  useEffect(() => {
    const cleanups:Array<()=>void>=[];
    const streams=[sceneStreams[0]||localStream,sceneStreams[1],sceneStreams[2]];
    const screenMeshes = Object.values(screenRefs.current).filter(Boolean) as THREE.Mesh[];
    const wall = screenWallRef.current;
    const binding: ScreenSourceBinding = { streams, mediaElement, runwayElement, mediaFit, locationPanel };
    if (screenMode === "wall" && wall) {
      screenMeshes.forEach((mesh) => { mesh.visible = false; });
      wall.visible = true;
      try {
        cleanups.push(screenStinger ? bindBrandSurface(wall, screenStinger.brand, true) : bindScreenSource(wall, screenWallSource, { ...binding, fitOverride: screenWallFit }));
      } catch { cleanups.push(bindBrandSurface(wall, "black")); }
    } else {
      if (wall) wall.visible = false;
      screenMeshes.forEach((mesh) => { mesh.visible = true; });
      (Object.keys(screenProgram) as ProductionScreenId[]).forEach((screen)=>{
        const mesh=screenRefs.current[screen];if(!mesh)return;
        const activeStinger=screenStinger?.targets.includes(screen)?screenStinger:null;
        try { cleanups.push(activeStinger ? bindBrandSurface(mesh,activeStinger.brand,true) : bindScreenSource(mesh, screenProgram[screen], binding)); }
        catch { cleanups.push(bindBrandSurface(mesh,"black")); }
      });
    }
    if(hostRef.current){hostRef.current.dataset.screenMode=screenMode;hostRef.current.dataset.screenWallSource=screenWallSource;hostRef.current.dataset.screenWallFit=screenWallFit;hostRef.current.dataset.screenWallFormat=screenWallFormat;hostRef.current.dataset.screenPrograms=Object.entries(screenProgram).map(([screen,source])=>`${screen}:${source}`).join(",");hostRef.current.dataset.screenStinger=screenStinger?.brand||"idle"}
    return()=>{cleanups.forEach((cleanup)=>cleanup());screenMeshes.forEach((mesh)=>{mesh.visible=true});if(wall)wall.visible=false};
  }, [loading, localStream, locationPanel, mediaElement, mediaFit, runwayElement, sceneStreams, screenMode, screenProgram, screenStinger, screenWallFit, screenWallFormat, screenWallSource]);

  return <div className="nexus-room-scene" ref={hostRef} data-media-source={mediaElement ? "connected" : "idle"} aria-label="Interactive Three.js Nexus control room">
    {loading && <div className="nexus-scene-loading"><span/><b>Loading Blender control room</b></div>}
    {error && <div className="nexus-scene-error">{error}</div>}
    {xrMode !== "none" && !loading && <div className={`nexus-xr-gate ${xrState}`}><button onClick={() => void (xrState === "live" ? endXRRef.current() : startXRRef.current())} disabled={xrState === "entering"}>{xrState === "entering" ? <LoaderCircle className="spin"/> : xrState === "live" ? <LogOut/> : <Glasses/>}<span>{xrState === "live" ? "Exit Nexus XR" : xrState === "entering" ? "Opening Nexus XR" : `Enter Nexus ${xrMode.toUpperCase()}`}</span></button><small>{xrMessage || (xrState === "live" ? "Left stick move / right stick snap turn" : "Quest controllers and local-floor tracking")}</small></div>}
  </div>;
}

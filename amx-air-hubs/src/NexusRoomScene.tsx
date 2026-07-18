import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeoAnchor } from "./geospatial";
import { forceWebGLDiagnostic, getRendererBackend, type RendererBackend } from "./webgpu";

export type LightPreset = "mission" | "focus" | "standby";
export type WorldCameraId = "overview" | "entry" | "rack" | "briefing";
export type WorldCameraCapture = (camera?: WorldCameraId) => Promise<Blob | null>;
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
  { id: "briefing", label: "Briefing", detail: "Human and agent collaboration stage" },
];

interface Props {
  localStream: MediaStream | null;
  sceneStreams?: MediaStream[];
  mediaElement?: HTMLVideoElement | null;
  locationPanel?: LocationPanelData | null;
  anchors: GeoAnchor[];
  lightPreset: LightPreset;
  reducedMotion?: boolean;
  avatarUrl?: string;
  activeWorldCamera?: WorldCameraId;
  onReady?: () => void;
  onBackend?: (backend: RendererBackend) => void;
  onCaptureReady?: (capture: WorldCameraCapture | null) => void;
  onAvatarState?: (state: "idle" | "loading" | "ready" | "error") => void;
}

type ScreenName = "Screen_User" | "Screen_Agent_Left" | "Screen_Agent_Right";

function screenMaterial(texture: THREE.Texture) {
  return new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.38, roughness: 0.25, metalness: 0.05 });
}

function bindVideoElement(mesh: THREE.Mesh, video: HTMLVideoElement, mirror = false, owned = false) {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  if (mirror) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    texture.offset.x = 1;
  }
  const previous = mesh.material;
  const material = screenMaterial(texture);
  mesh.material = material;
  void video.play().catch(() => undefined);
  return () => {
    if (owned) {
      video.pause();
      video.srcObject = null;
    }
    texture.dispose();
    material.dispose();
    if (mesh.material === material) mesh.material = previous;
  };
}

function bindStream(mesh: THREE.Mesh, stream: MediaStream, mirror = false) {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  return bindVideoElement(mesh, video, mirror, true);
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
  scene.add(rig);
  return camera;
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

export function NexusRoomScene({ localStream, sceneStreams = [], mediaElement, locationPanel, anchors, lightPreset, reducedMotion, avatarUrl, activeWorldCamera = "overview", onReady, onBackend, onCaptureReady, onAvatarState }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const screenRefs = useRef<Record<ScreenName, THREE.Mesh | null>>({ Screen_User: null, Screen_Agent_Left: null, Screen_Agent_Right: null });
  const lightRefs = useRef<THREE.Light[]>([]);
  const anchorLayerRef = useRef<THREE.Group | null>(null);
  const avatarRef = useRef<THREE.Object3D | null>(null);
  const activeCameraRef = useRef<WorldCameraId>(activeWorldCamera);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const onReadyRef = useRef(onReady);
  const onBackendRef = useRef(onBackend);
  const onCaptureReadyRef = useRef(onCaptureReady);
  const onAvatarStateRef = useRef(onAvatarState);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onBackendRef.current = onBackend; }, [onBackend]);
  useEffect(() => { onCaptureReadyRef.current = onCaptureReady; }, [onCaptureReady]);
  useEffect(() => { onAvatarStateRef.current = onAvatarState; }, [onAvatarState]);
  useEffect(() => { activeCameraRef.current = activeWorldCamera; }, [activeWorldCamera]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x02070d);
    scene.fog = new THREE.FogExp2(0x02070d, 0.025);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.05, 100);
    camera.position.set(0, 4.15, 9.4);
    const renderer = new THREE.WebGPURenderer({
      antialias: true,
      powerPreference: "high-performance",
      forceWebGL: forceWebGLDiagnostic(),
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.domElement.className = "nexus-room-canvas";
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.55, -1.2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 4.8;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotate = false;
    const worldCameras = new Map<WorldCameraId, THREE.PerspectiveCamera>();
    worldCameras.set("entry", addWorldCamera(scene, "entry", new THREE.Vector3(-4.35, 3.25, 4.35), new THREE.Vector3(0.3, 1.35, -2.25)));
    worldCameras.set("rack", addWorldCamera(scene, "rack", new THREE.Vector3(4.45, 2.85, 3.25), new THREE.Vector3(-2.5, 1.25, -1.5)));
    worldCameras.set("briefing", addWorldCamera(scene, "briefing", new THREE.Vector3(0, 3.25, -4.6), new THREE.Vector3(0, 1.15, 0.4)));
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
      scene.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      host.dataset.modelBounds = `${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
      host.dataset.modelCenter = `${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}`;
      host.dataset.modelRange = `${bounds.min.z.toFixed(2)}:${bounds.max.z.toFixed(2)}`;
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
    const render = () => {
      const currentFrame = frame++;
      host.dataset.frames = String(currentFrame);
      const elapsed = clock.getElapsedTime();
      const selectedCamera = activeCameraRef.current;
      if (selectedCamera !== lastWorldCamera) {
        if (selectedCamera === "overview") {
          camera.position.set(0, 4.15, 9.4);
          controls.target.set(0, 1.55, -1.2);
          controls.enabled = true;
          controls.autoRotate = false;
        } else {
          const selected = worldCameras.get(selectedCamera);
          if (selected) {
            camera.position.copy(selected.position);
            camera.quaternion.copy(selected.quaternion);
            camera.updateMatrixWorld();
          }
          controls.enabled = false;
          controls.autoRotate = false;
        }
        lastWorldCamera = selectedCamera;
        host.dataset.worldCamera = selectedCamera;
      }
      controls.update();
      if (model && !reducedMotion) {
        const hologram = model.getObjectByName("Nexus_Hologram");
        if (hologram) hologram.rotation.y = elapsed * 0.3;
        ["HoloOrbit_A", "HoloOrbit_B", "HoloOrbit_C"].forEach((name, index) => {
          const orbit = model?.getObjectByName(name);
          if (orbit) orbit.rotation.z += 0.0015 * (index % 2 ? -1 : 1);
        });
      }
      renderer.render(scene, camera);
      if (captureFrame || currentFrame % 30 === 0) {
        host.dataset.drawCalls = String(renderer.info.render.drawCalls);
        host.dataset.triangles = String(renderer.info.render.triangles);
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
        const captureCamera = requestedCamera === "overview" ? camera : worldCameras.get(requestedCamera) || camera;
        renderer.render(scene, captureCamera);
        return new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, "image/jpeg", 0.86));
      });
      animate();
    }).catch((initError: unknown) => {
      if (disposed) return;
      setLoading(false);
      setError(initError instanceof Error ? initError.message : "The GPU renderer could not be initialized");
    });
    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      void renderer.dispose();
      onCaptureReadyRef.current?.(null);
      if (avatarRef.current) disposeObject(avatarRef.current);
      avatarRef.current = null;
      sceneRef.current = null;
      anchorLayerRef.current = null;
      screenRefs.current = { Screen_User: null, Screen_Agent_Left: null, Screen_Agent_Right: null };
      lightRefs.current = [];
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [reducedMotion]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (avatarRef.current) {
      scene.remove(avatarRef.current);
      disposeObject(avatarRef.current);
      avatarRef.current = null;
    }
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
    loader.load(avatarUrl, (gltf) => {
      if (cancelled || !sceneRef.current) {
        disposeObject(gltf.scene);
        return;
      }
      const avatar = gltf.scene;
      avatar.name = "ZOHUND_Avatar";
      const bounds = new THREE.Box3().setFromObject(avatar);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = size.y > 0 ? 1.78 / size.y : 1;
      avatar.scale.setScalar(scale);
      const scaledBounds = new THREE.Box3().setFromObject(avatar);
      const scaledSize = scaledBounds.getSize(new THREE.Vector3());
      avatar.position.set(1.25, -scaledBounds.min.y, 0.65);
      avatar.rotation.y = Math.PI;
      sceneRef.current.add(avatar);
      avatarRef.current = avatar;
      if (hostRef.current) {
        hostRef.current.dataset.avatar = "ready";
        hostRef.current.dataset.avatarBounds = `${scaledSize.x.toFixed(2)}x${scaledSize.y.toFixed(2)}x${scaledSize.z.toFixed(2)}`;
      }
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
    const mesh = screenRefs.current.Screen_User;
    const stream = sceneStreams[0] || localStream;
    if (!mesh || !stream) return;
    return bindStream(mesh, stream, true);
  }, [localStream, loading, sceneStreams]);

  useEffect(() => {
    const mesh = screenRefs.current.Screen_Agent_Left;
    if (!mesh) return;
    if (mediaElement) return bindVideoElement(mesh, mediaElement);
    if (sceneStreams[1]) return bindStream(mesh, sceneStreams[1]);
  }, [loading, mediaElement, sceneStreams]);

  useEffect(() => {
    const mesh = screenRefs.current.Screen_Agent_Right;
    if (!mesh) return;
    if (!locationPanel) {
      if (sceneStreams[2]) return bindStream(mesh, sceneStreams[2]);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    drawLocationPanel(canvas, locationPanel);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    const previous = mesh.material;
    const material = screenMaterial(texture);
    mesh.material = material;
    const timer = window.setInterval(() => {
      drawLocationPanel(canvas, locationPanel);
      texture.needsUpdate = true;
    }, 1_000);
    return () => {
      window.clearInterval(timer);
      texture.dispose();
      material.dispose();
      if (mesh.material === material) mesh.material = previous;
    };
  }, [loading, locationPanel, sceneStreams]);

  return <div className="nexus-room-scene" ref={hostRef} aria-label="Interactive Three.js Nexus control room">
    {loading && <div className="nexus-scene-loading"><span/><b>Loading Blender control room</b></div>}
    {error && <div className="nexus-scene-error">{error}</div>}
  </div>;
}

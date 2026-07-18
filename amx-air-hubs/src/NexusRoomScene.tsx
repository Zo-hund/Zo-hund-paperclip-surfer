import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeoAnchor } from "./geospatial";
import { forceWebGLDiagnostic, getRendererBackend, type RendererBackend } from "./webgpu";

export type LightPreset = "mission" | "focus" | "standby";
export type WorldCameraId = "overview" | "entry" | "rack" | "briefing";
export type WorldCameraCapture = (camera?: WorldCameraId) => Promise<Blob | null>;

export const WORLD_CAMERAS: Array<{ id: WorldCameraId; label: string; detail: string }> = [
  { id: "overview", label: "Overview", detail: "Operator orbit camera" },
  { id: "entry", label: "Entry", detail: "Door and participant arrival view" },
  { id: "rack", label: "Rack aisle", detail: "Equipment and cooling aisle view" },
  { id: "briefing", label: "Briefing", detail: "Human and agent collaboration stage" },
];

interface Props {
  localStream: MediaStream | null;
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

export function NexusRoomScene({ localStream, anchors, lightPreset, reducedMotion, avatarUrl, activeWorldCamera = "overview", onReady, onBackend, onCaptureReady, onAvatarState }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const screenRef = useRef<THREE.Mesh | null>(null);
  const lightRefs = useRef<THREE.Light[]>([]);
  const anchorLayerRef = useRef<THREE.Group | null>(null);
  const avatarRef = useRef<THREE.Object3D | null>(null);
  const activeCameraRef = useRef<WorldCameraId>(activeWorldCamera);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
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
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.32;
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
          if (mesh.name === "Screen_User") screenRef.current = mesh;
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
      host.dataset.modelBounds = `${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`;
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
          controls.autoRotate = !reducedMotion;
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
      textureRef.current?.dispose();
      videoRef.current?.pause();
      onCaptureReadyRef.current?.(null);
      if (avatarRef.current) disposeObject(avatarRef.current);
      avatarRef.current = null;
      sceneRef.current = null;
      anchorLayerRef.current = null;
      screenRef.current = null;
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
      avatar.name = "ReadyPlayerMe_Avatar";
      const bounds = new THREE.Box3().setFromObject(avatar);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = size.y > 0 ? 1.78 / size.y : 1;
      avatar.scale.setScalar(scale);
      const scaledBounds = new THREE.Box3().setFromObject(avatar);
      avatar.position.set(0.1, -scaledBounds.min.y, 0.7);
      avatar.rotation.y = Math.PI;
      sceneRef.current.add(avatar);
      avatarRef.current = avatar;
      onAvatarStateRef.current?.("ready");
    }, undefined, () => {
      if (!cancelled) onAvatarStateRef.current?.("error");
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
    textureRef.current?.dispose();
    textureRef.current = null;
    videoRef.current?.pause();
    videoRef.current = null;
    if (!localStream || !screenRef.current) return;
    const video = document.createElement("video");
    video.srcObject = localStream;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    texture.offset.x = 1;
    texture.minFilter = THREE.LinearFilter;
    const mesh = screenRef.current;
    const previous = mesh.material;
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.38, roughness: 0.25, metalness: 0.05 });
    mesh.material = material;
    videoRef.current = video;
    textureRef.current = texture;
    return () => {
      video.pause();
      video.srcObject = null;
      texture.dispose();
      material.dispose();
      if (screenRef.current === mesh) mesh.material = previous;
    };
  }, [localStream, loading]);

  return <div className="nexus-room-scene" ref={hostRef} aria-label="Interactive Three.js Nexus control room">
    {loading && <div className="nexus-scene-loading"><span/><b>Loading Blender control room</b></div>}
    {error && <div className="nexus-scene-error">{error}</div>}
  </div>;
}

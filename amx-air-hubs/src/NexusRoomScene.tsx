import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeoAnchor } from "./geospatial";

export type LightPreset = "mission" | "focus" | "standby";

interface Props {
  localStream: MediaStream | null;
  anchors: GeoAnchor[];
  lightPreset: LightPreset;
  reducedMotion?: boolean;
  onReady?: () => void;
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

export function NexusRoomScene({ localStream, anchors, lightPreset, reducedMotion, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<THREE.Mesh | null>(null);
  const lightRefs = useRef<THREE.Light[]>([]);
  const anchorLayerRef = useRef<THREE.Group | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02070d);
    scene.fog = new THREE.FogExp2(0x02070d, 0.025);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.05, 100);
    camera.position.set(0, 4.15, 9.4);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
          mesh.castShadow = !mesh.name.startsWith("Screen_");
          mesh.receiveShadow = true;
          if (mesh.name === "Screen_User") screenRef.current = mesh;
        }
        if ((child as THREE.Light).isLight) {
          const light = child as THREE.Light;
          light.userData.baseIntensity = light.intensity;
          lightRefs.current.push(light);
          if ("castShadow" in light) light.castShadow = true;
        }
      });
      scene.add(model);
      setLoading(false);
      onReadyRef.current?.();
    }, undefined, (loadError) => {
      setLoading(false);
      setError(loadError instanceof Error ? loadError.message : "The Blender room could not be loaded");
    });

    const clock = new THREE.Clock();
    let animationId = 0;
    const render = () => {
      animationId = requestAnimationFrame(render);
      const elapsed = clock.getElapsedTime();
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
    };
    render();
    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      textureRef.current?.dispose();
      videoRef.current?.pause();
      anchorLayerRef.current = null;
      screenRef.current = null;
      lightRefs.current = [];
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [reducedMotion]);

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

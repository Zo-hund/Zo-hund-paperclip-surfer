import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LiveVideoFeed } from "./LiveKitPod";
import type { StageSeat, StageVenueLayout } from "./stage-events";
import type { SponsorCreative, StageAudioState, StageMode, StageScreenId, StageShot } from "./stage-production";
import type { StageProgramMediaState } from "./stage-program-media";
import { smoothCameraMotionProgress, stageCameraMotionPreset, stageCameraMotionProgress, type StageCameraMotionState } from "./stage-camera-motion";
import { forceWebGLDiagnostic, getRendererBackend, type RendererBackend } from "./webgpu";

interface Props {
  mode: StageMode;
  shot: StageShot;
  cameraMotion: StageCameraMotionState;
  sponsor: SponsorCreative;
  generalSeats: number;
  vipSeats: number;
  seats: StageSeat[];
  venueLayout: StageVenueLayout;
  live: boolean;
  audio: StageAudioState;
  programFeed?: LiveVideoFeed | null;
  programMedia?: StageProgramMediaState | null;
  screenRoutes?: Record<StageScreenId, string>;
  videoFeeds?: LiveVideoFeed[];
  mediaLibrary?: Array<{ id: string; name: string; url: string; contentType: string }>;
  reducedMotion?: boolean;
  portraitFraming?: boolean;
  onBackend?: (backend: RendererBackend) => void;
}

const SHOTS: Record<StageShot, { position: THREE.Vector3; target: THREE.Vector3; operator: number }> = {
  wide: { position: new THREE.Vector3(0, 5.4, 13.5), target: new THREE.Vector3(0, 2.3, -4.2), operator: 0 },
  host: { position: new THREE.Vector3(2.1, 2.45, 2.3), target: new THREE.Vector3(0, 2, -4.35), operator: 1 },
  audience: { position: new THREE.Vector3(0, 3.2, -2.1), target: new THREE.Vector3(0, 1.25, 6.1), operator: 2 },
  crane: { position: new THREE.Vector3(-8.4, 8.2, 8.4), target: new THREE.Vector3(0, 2, -3.4), operator: 0 },
};
const DEFAULT_SCREEN_ROUTES: Record<StageScreenId, string> = { center: "program", left: "program", right: "program" };
const NO_VIDEO_FEEDS: LiveVideoFeed[] = [];
const NO_MEDIA_LIBRARY: Array<{ id: string; name: string; url: string; contentType: string }> = [];

const SCORE_LIGHTING = {
  house: { primary: 0xd9f7ff, secondary: 0x8bc9d8, background: 0x061017 },
  keynote: { primary: 0xffffff, secondary: 0x55e6ff, background: 0x02070d },
  "neon-grid": { primary: 0x55e6ff, secondary: 0xff63de, background: 0x050413 },
  audience: { primary: 0xf4c96b, secondary: 0x79eea8, background: 0x0b0904 },
  brand: { primary: 0x55e6ff, secondary: 0xff63de, background: 0x030611 },
  finale: { primary: 0xffd376, secondary: 0xff63de, background: 0x0c0612 },
} as const;

function box(size: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  return mesh;
}

function createCameraOperator(index: number) {
  const group = new THREE.Group();
  group.name = `NPC_Camera_Operator_${index + 1}`;
  const suit = new THREE.MeshStandardMaterial({ color: index === 1 ? 0x182b34 : 0x121a21, roughness: 0.72, metalness: 0.18 });
  const skin = new THREE.MeshStandardMaterial({ color: index === 2 ? 0x7b4d35 : 0xb97a56, roughness: 0.9 });
  const cameraMaterial = new THREE.MeshStandardMaterial({ color: 0x202b31, roughness: 0.35, metalness: 0.72 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.72, 5, 10), suit);
  body.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), skin);
  head.position.y = 1.86;
  const rig = box([0.58, 0.32, 0.52], [0, 1.48, -0.56], cameraMaterial);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.38, 16), cameraMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.49, -0.95);
  const tallyMaterial = new THREE.MeshBasicMaterial({ color: 0x3a1115, toneMapped: false });
  const tally = box([0.15, 0.08, 0.03], [0, 1.69, -0.84], tallyMaterial);
  tally.name = "Camera_Tally";
  [-0.18, 0.18].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 8), cameraMaterial);
    leg.position.set(x, 0.68, -0.55);
    leg.rotation.z = x * 0.2;
    group.add(leg);
  });
  group.add(body, head, rig, lens, tally);
  return group;
}

function drawSponsor(canvas: HTMLCanvasElement, creative: SponsorCreative, brand: HTMLImageElement, live: boolean) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#03080d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = creative.accent;
  context.fillRect(0, 0, 18, canvas.height);
  context.fillRect(0, canvas.height - 18, canvas.width, 18);
  if (brand.complete && brand.naturalWidth) {
    const size = canvas.height * 0.76;
    context.globalAlpha = 0.3;
    context.drawImage(brand, canvas.width - size * 0.82, (canvas.height - size) / 2, size * 0.76, size);
    context.globalAlpha = 1;
  }
  context.fillStyle = "#f5fbfc";
  context.font = "800 72px Arial";
  context.fillText(creative.name.toUpperCase().slice(0, 26), 70, 155);
  context.fillStyle = creative.accent;
  context.font = "700 33px Arial";
  context.fillText(creative.headline.toUpperCase().slice(0, 48), 72, 225);
  context.fillStyle = "#91a8ad";
  context.font = "700 25px Arial";
  context.fillText(creative.cta.toUpperCase().slice(0, 42), 72, 290);
  context.fillStyle = live ? "#ff596a" : "#79eea8";
  context.beginPath();
  context.arc(86, 356, 11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#c8d8db";
  context.font = "800 22px Arial";
  context.fillText(live ? "ON AIR" : "STAGE READY", 110, 364);
}

function drawSponsorRibbon(canvas: HTMLCanvasElement, creative: SponsorCreative, live: boolean) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#03080d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = creative.accent;
  context.fillRect(0, 0, canvas.width, 4);
  context.fillRect(0, canvas.height - 4, canvas.width, 4);
  context.fillRect(0, 0, 16, canvas.height);
  context.fillStyle = "#f5fbfc";
  context.font = "800 27px Arial";
  context.textBaseline = "middle";
  const label = `AMX AIR HUBS.CC  //  ${creative.name.toUpperCase().slice(0, 26)}  //  ${creative.headline.toUpperCase().slice(0, 52)}  //  ${live ? "LIVE" : "STAGE READY"}`;
  context.fillText(label, 48, canvas.height / 2);
}

function bindVideoToScreens(meshes: THREE.Mesh[], video: HTMLVideoElement, detach?: () => void) {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const previous = meshes.map((mesh) => mesh.material);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
  meshes.forEach((mesh) => { mesh.material = material; });
  void video.play().catch(() => undefined);
  return () => {
    video.pause();
    detach?.();
    video.removeAttribute("src");
    video.load();
    texture.dispose();
    material.dispose();
    meshes.forEach((mesh, index) => { if (mesh.material === material) mesh.material = previous[index]; });
  };
}

function bindStream(meshes: THREE.Mesh[], feed: LiveVideoFeed) {
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  if (feed.track) feed.track.attach(video);
  else video.srcObject = feed.stream;
  return bindVideoToScreens(meshes, video, () => {
    if (feed.track) feed.track.detach(video);
    else video.srcObject = null;
  });
}

function bindProgramMedia(meshes: THREE.Mesh[], media: StageProgramMediaState) {
  const video = document.createElement("video");
  video.src = media.url;
  video.autoplay = media.transport === "playing";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.currentTime = Math.max(0, media.positionSeconds || 0);
  const cleanup = bindVideoToScreens(meshes, video);
  if (media.transport === "paused") video.pause();
  return cleanup;
}

function disposeObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

export function AMXXRStageScene({ mode, shot, cameraMotion, sponsor, generalSeats, vipSeats, seats, venueLayout, live, audio, programFeed, programMedia, screenRoutes = DEFAULT_SCREEN_ROUTES, videoFeeds = NO_VIDEO_FEEDS, mediaLibrary = NO_MEDIA_LIBRARY, reducedMotion, portraitFraming, onBackend }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ mode, shot, cameraMotion, sponsor, generalSeats, vipSeats, seats, venueLayout, live, audio });
  const programScreensRef = useRef<THREE.Mesh[]>([]);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { stateRef.current = { mode, shot, cameraMotion, sponsor, generalSeats, vipSeats, seats, venueLayout, live, audio }; }, [audio, cameraMotion, generalSeats, live, mode, seats, shot, sponsor, venueLayout, vipSeats]);

  useEffect(() => {
    const host = hostRef.current;
    const screens = programScreensRef.current;
    if (host) {
      host.dataset.programFeed = programFeed?.name || programMedia?.name || "virtual";
      host.dataset.programFeedId = programFeed?.id || "none";
      host.dataset.programFeedSource = programFeed?.source || (programMedia ? "media-library" : "virtual");
      host.dataset.programFeedLive = String(Boolean((programFeed && !programFeed.muted) || programMedia?.url));
    }
    if (screens.length !== 3) return;
    const screenIds: StageScreenId[] = ["center", "left", "right"];
    const groups = new Map<string, THREE.Mesh[]>();
    screenIds.forEach((id, index) => {
      const route = screenRoutes[id] || "program";
      groups.set(route, [...(groups.get(route) || []), screens[index]]);
    });
    const cleanups: Array<() => void> = [];
    groups.forEach((routeScreens, route) => {
      if (route === "sponsor" || route === "virtual") return;
      if (route === "program") {
        if (programFeed && !programFeed.muted) cleanups.push(bindStream(routeScreens, programFeed));
        else if (programMedia?.url) cleanups.push(bindProgramMedia(routeScreens, programMedia));
        return;
      }
      if (route.startsWith("feed:")) {
        const feed = videoFeeds.find((item) => `feed:${item.id}` === route);
        if (feed && !feed.muted) cleanups.push(bindStream(routeScreens, feed));
        return;
      }
      if (route.startsWith("media:")) {
        const asset = mediaLibrary.find((item) => `media:${item.id}` === route);
        if (asset) cleanups.push(bindProgramMedia(routeScreens, { ...programMedia, url: asset.url, name: asset.name, contentType: asset.contentType, fit: programMedia?.fit || "contain", muted: true, transport: "playing", startedAt: Date.now(), positionSeconds: 0 }));
      }
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [mediaLibrary, programFeed, programMedia, screenRoutes, sceneGeneration, videoFeeds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02070d);
    scene.fog = new THREE.FogExp2(0x02070d, 0.018);
    const initialAspect = host.clientWidth / Math.max(1, host.clientHeight);
    const portraitFov = (aspect: number) => portraitFraming && aspect < 1
      ? Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(42) / 2) * 1.6 / Math.max(0.35, aspect))))
      : 42;
    const camera = new THREE.PerspectiveCamera(portraitFov(initialAspect), initialAspect, 0.08, 120);
    camera.position.copy(SHOTS.wide.position);
    camera.lookAt(SHOTS.wide.target);
    const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: "high-performance", forceWebGL: forceWebGLDiagnostic() });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = "amx-stage-canvas";
    host.appendChild(renderer.domElement);

    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x101b22, metalness: 0.68, roughness: 0.34 });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x07141a, metalness: 0.28, roughness: 0.62 });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x55e6ff, toneMapped: false });
    const magenta = new THREE.MeshBasicMaterial({ color: 0xff63de, toneMapped: false });
    const gold = new THREE.MeshBasicMaterial({ color: 0xf4c96b, toneMapped: false });
    materials.push(darkMetal, floorMaterial, cyan, magenta, gold);

    const houseLight = new THREE.HemisphereLight(0xbdefff, 0x02070d, 1.35);
    scene.add(houseLight);
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-5, 10, 8);
    scene.add(key);
    const cyanWash = new THREE.SpotLight(0x55e6ff, 105, 30, 0.52, 0.42, 1.2);
    cyanWash.position.set(-5, 8, 2);
    cyanWash.target.position.set(-2, 0.5, -4);
    const magentaWash = new THREE.SpotLight(0xff63de, 95, 30, 0.52, 0.42, 1.2);
    magentaWash.position.set(5, 8, 2);
    magentaWash.target.position.set(2, 0.5, -4);
    scene.add(cyanWash, cyanWash.target, magentaWash, magentaWash.target);

    const scoreSpots: THREE.SpotLight[] = [];
    [-5.7, -1.9, 1.9, 5.7].forEach((x, index) => {
      const fixture = new THREE.SpotLight(index % 2 ? 0xff63de : 0x55e6ff, 70, 28, 0.34, 0.5, 1.25);
      fixture.position.set(x, 8.3, -1.2);
      fixture.target.position.set(x * 0.46, 0.5, -4.25);
      scoreSpots.push(fixture);
      scene.add(fixture, fixture.target);
    });

    const laserMaterial = new THREE.MeshBasicMaterial({ color: 0x55e6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const prismMaterial = new THREE.MeshBasicMaterial({ color: 0xff63de, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0x55e6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    materials.push(laserMaterial, prismMaterial, pulseMaterial);
    const laserGroup = new THREE.Group();
    const laserBeams: THREE.Mesh[] = [];
    for (let index = 0; index < 7; index += 1) {
      const beam = box([0.035, 0.035, 13], [(index - 3) * 1.55, 4.8, -1.6], laserMaterial);
      beam.rotation.x = 0.48;
      beam.rotation.z = (index - 3) * 0.055;
      laserBeams.push(beam);
      laserGroup.add(beam);
    }
    laserGroup.visible = false;
    scene.add(laserGroup);
    const prismGroup = new THREE.Group();
    [1.35, 1.8, 2.25].forEach((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035 + index * 0.008, 10, 72), prismMaterial);
      ring.position.set(0, 4.15, -6.86 + index * 0.012);
      ring.userData.spin = index % 2 ? -1 : 1;
      prismGroup.add(ring);
    });
    prismGroup.visible = false;
    scene.add(prismGroup);
    const beatRing = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.16, 72), pulseMaterial);
    beatRing.rotation.x = -Math.PI / 2;
    beatRing.position.set(0, 0.68, -4.2);
    beatRing.visible = false;
    scene.add(beatRing);

    const confettiPositions = new Float32Array(180 * 3);
    for (let index = 0; index < 180; index += 1) {
      confettiPositions[index * 3] = (Math.random() - 0.5) * 12;
      confettiPositions[index * 3 + 1] = 0.8 + Math.random() * 7.4;
      confettiPositions[index * 3 + 2] = -7 + Math.random() * 6;
    }
    const confettiGeometry = new THREE.BufferGeometry();
    confettiGeometry.setAttribute("position", new THREE.BufferAttribute(confettiPositions, 3));
    const confettiMaterial = new THREE.PointsMaterial({ color: 0xffd376, size: 0.075, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    materials.push(confettiMaterial);
    const confetti = new THREE.Points(confettiGeometry, confettiMaterial);
    confetti.visible = false;
    scene.add(confetti);

    const floor = box([22, 0.25, 24], [0, -0.18, 1], floorMaterial);
    scene.add(floor);
    for (let x = -10; x <= 10; x += 2) scene.add(box([0.025, 0.012, 23], [x, 0, 1], x % 4 === 0 ? cyan : darkMetal));
    for (let z = -10; z <= 12; z += 2) scene.add(box([21, 0.012, 0.025], [0, 0, z], z % 4 === 0 ? magenta : darkMetal));

    const stage = box([12.5, 0.6, 5.2], [0, 0.3, -4.6], darkMetal);
    scene.add(stage);
    scene.add(box([12.1, 0.07, 0.12], [0, 0.64, -2.08], cyan));
    scene.add(box([12.1, 0.07, 0.12], [0, 0.64, -7.12], magenta));
    const runway = box([2.2, 0.38, 6.4], [0, 0.2, 0.45], darkMetal);
    scene.add(runway, box([1.9, 0.04, 6.1], [0, 0.41, 0.45], new THREE.MeshBasicMaterial({ color: 0x133e48, toneMapped: false })));

    const sponsorCanvas = document.createElement("canvas");
    sponsorCanvas.width = 1280;
    sponsorCanvas.height = 420;
    const brandImage = new Image();
    brandImage.src = "/brand/amx-air-hubs-brand.png";
    const sponsorTexture = new THREE.CanvasTexture(sponsorCanvas);
    sponsorTexture.colorSpace = THREE.SRGBColorSpace;
    sponsorTexture.minFilter = THREE.LinearFilter;
    textures.push(sponsorTexture);
    const sponsorMaterial = new THREE.MeshBasicMaterial({ map: sponsorTexture, toneMapped: false, side: THREE.DoubleSide });
    materials.push(sponsorMaterial);
    const programScreen = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), sponsorMaterial);
    programScreen.position.set(0, 4.25, -7.05);
    scene.add(programScreen);
    const leftSponsor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.36), sponsorMaterial);
    leftSponsor.position.set(-6.45, 3.2, -5.6);
    leftSponsor.rotation.y = 0.38;
    const rightSponsor = leftSponsor.clone();
    rightSponsor.position.x = 6.45;
    rightSponsor.rotation.y = -0.38;
    programScreensRef.current = [programScreen, leftSponsor, rightSponsor];
    setSceneGeneration((generation) => generation + 1);
    scene.add(leftSponsor, rightSponsor);
    const screenFrame = (screen: THREE.Mesh, width: number, height: number) => {
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.34, height + 0.34), darkMetal);
      frame.position.copy(screen.position);
      frame.rotation.copy(screen.rotation);
      frame.translateZ(-0.035);
      const trim = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.12, height + 0.12), cyan);
      trim.position.copy(screen.position);
      trim.rotation.copy(screen.rotation);
      trim.translateZ(-0.018);
      scene.add(frame, trim);
    };
    screenFrame(programScreen, 9.6, 5.4);
    screenFrame(leftSponsor, 4.2, 2.36);
    screenFrame(rightSponsor, 4.2, 2.36);
    const ribbonCanvas = document.createElement("canvas");
    ribbonCanvas.width = 2048;
    ribbonCanvas.height = 70;
    const ribbonTexture = new THREE.CanvasTexture(ribbonCanvas);
    ribbonTexture.colorSpace = THREE.SRGBColorSpace;
    ribbonTexture.minFilter = THREE.LinearFilter;
    textures.push(ribbonTexture);
    const ribbonMaterial = new THREE.MeshBasicMaterial({ map: ribbonTexture, toneMapped: false, side: THREE.DoubleSide });
    materials.push(ribbonMaterial);
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(19, 0.65), ribbonMaterial);
    ribbon.position.set(0, 7.05, -7.3);
    scene.add(ribbon);
    host.dataset.ribbonAspect = `${ribbonCanvas.width}:${ribbonCanvas.height}`;

    const seatGroups: THREE.Mesh[] = [];
    const seatOpen = new THREE.MeshStandardMaterial({ color: 0x15252d, roughness: 0.72, metalness: 0.25 });
    const seatFilled = new THREE.MeshStandardMaterial({ color: 0x287f91, roughness: 0.58, metalness: 0.22 });
    const seatVip = new THREE.MeshStandardMaterial({ color: 0xb98e35, roughness: 0.48, metalness: 0.44 });
    const seatHeld = new THREE.MeshStandardMaterial({ color: 0xd39b35, emissive: 0x5b3607, emissiveIntensity: 0.38, roughness: 0.52, metalness: 0.32 });
    const seatCheckedIn = new THREE.MeshStandardMaterial({ color: 0x2a9560, emissive: 0x0a4027, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.25 });
    const seatBlocked = new THREE.MeshStandardMaterial({ color: 0x3a1722, roughness: 0.82, metalness: 0.12 });
    materials.push(seatOpen, seatFilled, seatVip, seatHeld, seatCheckedIn, seatBlocked);
    let generalIndex = 0;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 9; column++) {
        const x = (column - 4) * 1.18;
        const z = 4.1 + row * 1.55;
        const seat = box([0.78, 0.7, 0.76], [x, 0.46 + row * 0.13, z], seatOpen);
        seat.userData.seatType = "general";
        seat.userData.seatIndex = generalIndex++;
        seat.userData.seatId = `H-${String.fromCharCode(65 + row)}${String(column + 1).padStart(2, "0")}`;
        seat.userData.row = row;
        seat.userData.column = column;
        seat.rotation.x = -0.08;
        seatGroups.push(seat);
        scene.add(seat);
      }
    }
    let vipIndex = 0;
    for (let column = 0; column < 8; column++) {
      const x = (column - 3.5) * 1.28;
      const seat = box([0.9, 0.76, 0.82], [x, 0.5, 2.25], seatOpen);
      seat.userData.seatType = "vip";
      seat.userData.seatIndex = vipIndex++;
      seat.userData.seatId = `V-V${String(column + 1).padStart(2, "0")}`;
      seat.userData.column = column;
      seatGroups.push(seat);
      scene.add(seat);
    }

    const operators = [createCameraOperator(0), createCameraOperator(1), createCameraOperator(2)];
    operators[0].position.set(-4.5, 0, 1.5);
    operators[1].position.set(4.2, 0, -0.4);
    operators[2].position.set(6.1, 0, 5.2);
    operators.forEach((operator) => scene.add(operator));

    const djBooth = new THREE.Group();
    djBooth.name = "DJ_Booth_Pod";
    const boothShell = box([4.7, 1.15, 1.35], [0, 1.2, 0], darkMetal);
    const boothFront = box([4.25, 0.08, 0.04], [0, 1.25, 0.7], cyan);
    const mixer = box([1.12, 0.12, 0.72], [0, 1.84, -0.05], darkMetal);
    const crossfaderKnob = box([0.12, 0.1, 0.18], [0, 1.94, 0.06], gold);
    const platterMaterialA = new THREE.MeshStandardMaterial({ color: 0x163844, emissive: 0x0b6f80, emissiveIntensity: 0.65, metalness: 0.62, roughness: 0.3 });
    const platterMaterialB = new THREE.MeshStandardMaterial({ color: 0x36163c, emissive: 0x8a197d, emissiveIntensity: 0.65, metalness: 0.62, roughness: 0.3 });
    materials.push(platterMaterialA, platterMaterialB);
    const platterA = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 30), platterMaterialA);
    platterA.position.set(-1.38, 1.88, -0.03);
    const platterB = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 30), platterMaterialB);
    platterB.position.set(1.38, 1.88, -0.03);
    const vuBars: THREE.Mesh[] = [];
    for (let index = 0; index < 8; index += 1) {
      const bar = box([0.12, 0.04, 0.08], [-0.49 + index * 0.14, 2.03, -0.05], index < 5 ? cyan : magenta);
      vuBars.push(bar);
      djBooth.add(bar);
    }
    const speakerMaterial = new THREE.MeshStandardMaterial({ color: 0x0a1116, metalness: 0.32, roughness: 0.7 });
    materials.push(speakerMaterial);
    [-2.95, 2.95].forEach((x) => {
      const speaker = box([0.82, 2.35, 0.76], [x, 1.35, -0.18], speakerMaterial);
      const woofer = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 22), darkMetal);
      woofer.rotation.x = Math.PI / 2;
      woofer.position.set(x, 1.12, 0.22);
      const tweeter = woofer.clone();
      tweeter.scale.setScalar(0.52);
      tweeter.position.y = 1.82;
      djBooth.add(speaker, woofer, tweeter);
    });
    [-0.62, 0.62].forEach((x) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), darkMetal);
      arm.position.set(x, 2.35, -0.12);
      arm.rotation.z = x > 0 ? -0.5 : 0.5;
      const microphone = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 4, 8), gold);
      microphone.position.set(x * 1.42, 2.72, -0.12);
      microphone.rotation.z = Math.PI / 2;
      djBooth.add(arm, microphone);
    });
    djBooth.add(boothShell, boothFront, mixer, crossfaderKnob, platterA, platterB);
    djBooth.position.set(-3.65, 0, -4.25);
    djBooth.scale.setScalar(0.72);
    scene.add(djBooth);
    host.dataset.djBooth = "ready";

    const crane = new THREE.Group();
    crane.name = "Camera_Crane";
    const craneArm = box([0.16, 0.16, 7.2], [0, 4.7, 0], darkMetal);
    craneArm.rotation.x = -0.35;
    crane.add(craneArm, box([0.9, 0.55, 0.8], [0, 3.45, -3.4], darkMetal));
    crane.position.set(-7.4, 0, 4.2);
    crane.rotation.y = -0.42;
    scene.add(crane);

    let hostAvatar: THREE.Object3D | null = null;
    new GLTFLoader().load("/models/zohund-stage/avatar.gltf", (gltf) => {
      hostAvatar = gltf.scene;
      const avatarMaterials = new Set<THREE.Material>();
      hostAvatar.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => avatarMaterials.add(material));
      });
      host.dataset.hostAvatarMaterials = String(avatarMaterials.size);
      if (disposed || !hostAvatar) {
        disposeObject(gltf.scene);
        hostAvatar = null;
        return;
      }
      const bounds = new THREE.Box3().setFromObject(hostAvatar);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 2.45 / Math.max(0.01, size.y);
      hostAvatar.scale.setScalar(scale);
      const normalized = new THREE.Box3().setFromObject(hostAvatar);
      const center = normalized.getCenter(new THREE.Vector3());
      hostAvatar.position.set(-center.x, 0.66 - normalized.min.y, -4.25 - center.z);
      hostAvatar.rotation.y = Math.PI;
      scene.add(hostAvatar);
      host.dataset.hostAvatar = "ready";
    }, undefined, () => { host.dataset.hostAvatar = "unavailable"; });

    let disposed = false;
    let frame = 0;
    let animationFrame = 0;
    let lastSponsor = "";
    let lastSeatState = "";
    let lastVenueLayout: StageVenueLayout | "" = "";
    let lastMode: StageMode | "" = "";
    const clock = new THREE.Clock();
    const motionPosition = new THREE.Vector3();
    const motionTarget = new THREE.Vector3();
    const calculatedPosition = new THREE.Vector3();
    const calculatedTarget = new THREE.Vector3();
    const desiredMatrix = new THREE.Matrix4();
    const desiredQuaternion = new THREE.Quaternion();
    const rollQuaternion = new THREE.Quaternion();
    const cameraAxis = new THREE.Vector3(0, 0, 1);
    const animate = () => {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const current = stateRef.current;
      const targetShot = SHOTS[current.shot];
      const motionPreset = stageCameraMotionPreset(current.cameraMotion.id);
      const rawMotionProgress = stageCameraMotionProgress(current.cameraMotion);
      const motionProgress = smoothCameraMotionProgress(rawMotionProgress, current.cameraMotion.loop);
      const motionAmount = reducedMotion ? 0 : current.cameraMotion.intensity / 100;
      const baseFov = portraitFov(camera.aspect);
      let motionFov = baseFov;
      let cameraRoll = 0;
      motionPosition.copy(targetShot.position);
      motionTarget.copy(targetShot.target);
      calculatedPosition.copy(targetShot.position);
      calculatedTarget.copy(targetShot.target);
      if (current.cameraMotion.id === "crane-reveal") {
        calculatedPosition.set(-3.7, 3.15, 5.2).lerp(targetShot.position, motionProgress);
        calculatedTarget.set(0, 1.45, -2.2).lerp(targetShot.target, motionProgress);
        motionFov = THREE.MathUtils.lerp(baseFov + 8, baseFov - 2, motionProgress);
      } else if (current.cameraMotion.id === "crane-sweep") {
        calculatedPosition.set(THREE.MathUtils.lerp(-8.6, 8.6, motionProgress), 6.8 + Math.sin(motionProgress * Math.PI) * 2.1, 8.8);
        calculatedTarget.set(THREE.MathUtils.lerp(-1.4, 1.4, motionProgress), 1.9, -3.7);
        cameraRoll = THREE.MathUtils.lerp(-0.018, 0.018, motionProgress);
      } else if (current.cameraMotion.id === "dolly-push") {
        calculatedPosition.set(0, THREE.MathUtils.lerp(5.4, 4.1, motionProgress), THREE.MathUtils.lerp(13.5, 7.2, motionProgress));
        calculatedTarget.set(0, THREE.MathUtils.lerp(2.3, 2.05, motionProgress), -4.2);
        motionFov = THREE.MathUtils.lerp(baseFov, baseFov - 7, motionProgress);
      } else if (current.cameraMotion.id === "orbit-arc") {
        const angle = THREE.MathUtils.lerp(-0.72, 0.72, motionProgress);
        calculatedPosition.set(Math.sin(angle) * 7.1, 2.75 + Math.sin(motionProgress * Math.PI) * 0.65, -4.25 + Math.cos(angle) * 7.1);
        calculatedTarget.set(0, 1.95, -4.3);
      } else if (current.cameraMotion.id === "truck-parallax") {
        calculatedPosition.set(THREE.MathUtils.lerp(-4.4, 4.4, motionProgress), 2.5, 3.7);
        calculatedTarget.set(THREE.MathUtils.lerp(-1.15, 1.15, motionProgress), 1.95, -4.25);
      } else if (current.cameraMotion.id === "audience-pan") {
        calculatedPosition.copy(targetShot.position);
        calculatedTarget.set(THREE.MathUtils.lerp(-5.4, 5.4, motionProgress), 1.25, 6.1);
        motionFov = baseFov + 3;
      } else if (current.cameraMotion.id === "dolly-zoom") {
        const baseDistance = 6.65;
        const distance = THREE.MathUtils.lerp(baseDistance, baseDistance + 5.2, motionProgress);
        calculatedPosition.set(2.1, 2.45, targetShot.target.z + distance);
        calculatedTarget.copy(targetShot.target);
        motionFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * baseDistance / distance));
      }
      motionPosition.lerp(calculatedPosition, motionAmount);
      motionTarget.lerp(calculatedTarget, motionAmount);
      const desiredFov = THREE.MathUtils.lerp(baseFov, motionFov, motionAmount);
      if (Math.abs(camera.fov - desiredFov) > 0.01) {
        camera.fov = desiredFov;
        camera.updateProjectionMatrix();
      }
      const cameraEase = reducedMotion ? 1 : 0.055;
      camera.position.lerp(motionPosition, cameraEase);
      desiredMatrix.lookAt(camera.position, motionTarget, camera.up);
      desiredQuaternion.setFromRotationMatrix(desiredMatrix);
      if (cameraRoll) desiredQuaternion.multiply(rollQuaternion.setFromAxisAngle(cameraAxis, cameraRoll * motionAmount));
      camera.quaternion.slerp(desiredQuaternion, reducedMotion ? 1 : 0.08);

      const sponsorKey = `${current.sponsor.id}:${current.sponsor.headline}:${current.live}`;
      if (sponsorKey !== lastSponsor) {
        lastSponsor = sponsorKey;
        drawSponsor(sponsorCanvas, current.sponsor, brandImage, current.live);
        sponsorTexture.needsUpdate = true;
        drawSponsorRibbon(ribbonCanvas, current.sponsor, current.live);
        ribbonTexture.needsUpdate = true;
        host.dataset.sponsor = current.sponsor.id;
      }
      const seatKey = current.seats.map((seat) => `${seat.id}:${seat.status}`).join("|") || `${current.generalSeats}:${current.vipSeats}`;
      if (seatKey !== lastSeatState) {
        lastSeatState = seatKey;
        const seatPlan = new Map(current.seats.map((seat) => [seat.id, seat]));
        seatGroups.forEach((seat) => {
          const assignment = seatPlan.get(String(seat.userData.seatId));
          if (!assignment) seat.material = seatBlocked;
          else if (assignment.status === "checked-in") seat.material = seatCheckedIn;
          else if (assignment.status === "held") seat.material = seatHeld;
          else if (assignment.status === "reserved") seat.material = assignment.section === "vip" ? seatVip : seatFilled;
          else if (assignment.status === "blocked") seat.material = seatBlocked;
          else seat.material = seatOpen;
        });
        host.dataset.seats = `${current.generalSeats}:${current.vipSeats}`;
        host.dataset.seatPlan = String(current.seats.length);
      }
      if (current.venueLayout !== lastVenueLayout) {
        lastVenueLayout = current.venueLayout;
        seatGroups.forEach((seat) => {
          const column = Number(seat.userData.column);
          if (seat.userData.seatType === "vip") {
            const theaterX = (column - 3.5) * 1.28;
            if (current.venueLayout === "arena") {
              const angle = THREE.MathUtils.lerp(-0.48, 0.48, column / 7);
              seat.position.set(Math.sin(angle) * 6.6, 0.5, 1.25 + Math.cos(angle) * 1.25);
              seat.rotation.set(0, -angle, 0);
            } else if (current.venueLayout === "expo-hall") {
              seat.position.set(theaterX + (column < 4 ? -0.8 : 0.8), 0.5, 2.5 + (column % 2) * 0.55);
              seat.rotation.set(0, column < 4 ? -0.1 : 0.1, 0);
            } else {
              seat.position.set(theaterX, 0.5, 2.25);
              seat.rotation.set(0, 0, 0);
            }
            return;
          }
          const row = Number(seat.userData.row);
          if (current.venueLayout === "arena") {
            const angle = THREE.MathUtils.lerp(-0.68, 0.68, column / 8);
            const radius = 7.1 + row * 1.45;
            seat.position.set(Math.sin(angle) * radius, 0.46 + row * 0.13, -0.6 + Math.cos(angle) * radius);
            seat.rotation.set(-0.08, -angle, 0);
          } else if (current.venueLayout === "expo-hall") {
            const aisle = column <= 4 ? -1.05 : 1.05;
            seat.position.set((column - 4) * 1.25 + aisle, 0.46 + row * 0.08, 4.25 + row * 1.55);
            seat.rotation.set(-0.04, column < 4 ? -0.08 : column > 4 ? 0.08 : 0, 0);
          } else {
            seat.position.set((column - 4) * 1.18, 0.46 + row * 0.13, 4.1 + row * 1.55);
            seat.rotation.set(-0.08, 0, 0);
          }
        });
        host.dataset.venueLayout = current.venueLayout;
      }
      if (current.mode !== lastMode) {
        lastMode = current.mode;
        const color = current.mode === "metaverse" ? 0x7e5cff : current.mode === "online" ? 0xff63de : 0x55e6ff;
        cyanWash.color.setHex(color);
        scene.background = new THREE.Color(current.mode === "metaverse" ? 0x09051a : current.mode === "online" ? 0x100610 : 0x02070d);
        host.dataset.mode = current.mode;
      }
      operators.forEach((operator, index) => {
        const active = targetShot.operator === index;
        const tally = operator.getObjectByName("Camera_Tally") as THREE.Mesh | undefined;
        if (tally?.material instanceof THREE.MeshBasicMaterial) tally.material.color.setHex(active && current.live ? 0xff2e45 : 0x3a1115);
        if (!reducedMotion) {
          operator.position.x += Math.sin(elapsed * 0.45 + index * 2) * 0.0015;
          operator.rotation.y = Math.sin(elapsed * 0.24 + index) * 0.08 + (index === 1 ? -2.5 : index === 2 ? -2.1 : 0.4);
        }
      });
      const audioActive = current.audio.transport === "playing";
      if (audioActive && !reducedMotion) {
        const deckSpeed = current.audio.bpm / 7200;
        platterA.rotation.y += deckSpeed;
        platterB.rotation.y -= deckSpeed * 0.96;
      }
      const energy = audioActive ? 0.45 + Math.sin(elapsed * Math.max(2, current.audio.bpm / 30)) * 0.3 : 0.12;
      platterMaterialA.emissiveIntensity = 0.32 + energy;
      platterMaterialB.emissiveIntensity = 0.32 + energy;
      vuBars.forEach((bar, index) => {
        bar.scale.y = audioActive ? 0.7 + Math.abs(Math.sin(elapsed * 4.2 + index * 0.7)) * 2.4 : 0.42;
      });
      crossfaderKnob.position.x = THREE.MathUtils.lerp(-0.42, 0.42, current.audio.crossfader / 100);
      host.dataset.audioTransport = current.audio.transport;
      host.dataset.audioFormat = current.audio.format;
      host.dataset.audioBpm = String(current.audio.bpm);
      host.dataset.audioRecording = String(current.audio.recording);
      host.dataset.soundscape = current.audio.soundscape;
      const score = current.audio.score;
      const scoreLook = SCORE_LIGHTING[score.lighting];
      const scoreOrigin = score.firedAt || current.audio.startedAt || Date.now();
      const beatDuration = 60_000 / Math.max(60, Math.min(160, current.audio.bpm));
      const beatPhase = ((Date.now() - scoreOrigin) % beatDuration) / beatDuration;
      const beatPulse = score.beatSync ? Math.pow(1 - beatPhase, 4) : 0.35 + Math.sin(elapsed * 1.4) * 0.12;
      const scoreLevel = score.armed ? score.intensity / 100 : 0.22;
      houseLight.intensity = 0.9 + scoreLevel * 1.45;
      key.intensity = 1.8 + scoreLevel * 2.8;
      key.color.setHex(score.armed ? scoreLook.primary : 0xffffff);
      cyanWash.color.setHex(score.armed ? scoreLook.primary : current.mode === "metaverse" ? 0x7e5cff : 0x55e6ff);
      magentaWash.color.setHex(score.armed ? scoreLook.secondary : 0xff63de);
      cyanWash.intensity = 44 + scoreLevel * 98 + beatPulse * scoreLevel * 24;
      magentaWash.intensity = 40 + scoreLevel * 90 + beatPulse * scoreLevel * 20;
      scoreSpots.forEach((fixture, index) => {
        fixture.color.setHex(index % 2 ? scoreLook.secondary : scoreLook.primary);
        fixture.intensity = score.armed ? 28 + scoreLevel * 94 + beatPulse * scoreLevel * 32 : 18;
        if (!reducedMotion && score.armed && score.vfx === "laser-sweep") fixture.target.position.x = (index - 1.5) * 1.25 + Math.sin(elapsed * 0.9 + index) * 2.1;
        else fixture.target.position.x = [-5.7, -1.9, 1.9, 5.7][index] * 0.46;
      });
      renderer.toneMappingExposure = 1.02 + scoreLevel * 0.22;
      if (scene.background instanceof THREE.Color) scene.background.setHex(score.armed ? scoreLook.background : current.mode === "metaverse" ? 0x09051a : current.mode === "online" ? 0x100610 : 0x02070d);

      const laserActive = score.armed && score.vfx === "laser-sweep";
      laserGroup.visible = laserActive;
      laserMaterial.color.setHex(scoreLook.primary);
      laserMaterial.opacity = laserActive ? 0.12 + scoreLevel * 0.2 : 0;
      if (laserActive && !reducedMotion) laserBeams.forEach((beam, index) => { beam.rotation.y = Math.sin(elapsed * 0.72 + index * 0.44) * 0.32; });

      const prismActive = score.armed && score.vfx === "prism";
      prismGroup.visible = prismActive;
      prismMaterial.color.setHex(scoreLook.secondary);
      prismMaterial.opacity = prismActive ? 0.24 + beatPulse * 0.36 * scoreLevel : 0;
      if (prismActive && !reducedMotion) prismGroup.children.forEach((ring, index) => {
        ring.rotation.z += Number(ring.userData.spin) * (0.0018 + index * 0.0008);
        ring.scale.setScalar(1 + beatPulse * 0.035 * (index + 1));
      });

      const pulseActive = score.armed && score.vfx === "beat-pulse";
      beatRing.visible = pulseActive;
      pulseMaterial.color.setHex(scoreLook.primary);
      pulseMaterial.opacity = pulseActive ? Math.max(0.04, (1 - beatPhase) * 0.68 * scoreLevel) : 0;
      beatRing.scale.setScalar(0.65 + beatPhase * 2.5);

      const confettiActive = score.armed && score.vfx === "confetti";
      confetti.visible = confettiActive;
      confettiMaterial.color.setHex(frame % 90 < 45 ? scoreLook.primary : scoreLook.secondary);
      confettiMaterial.opacity = confettiActive ? 0.55 + scoreLevel * 0.35 : 0;
      if (confettiActive && !reducedMotion) {
        const positions = confettiGeometry.getAttribute("position") as THREE.BufferAttribute;
        const values = positions.array as Float32Array;
        for (let index = 0; index < values.length; index += 3) {
          values[index] += Math.sin(elapsed * 1.6 + index) * 0.0015;
          values[index + 1] -= 0.012 + (index % 7) * 0.001;
          if (values[index + 1] < 0.72) values[index + 1] = 8.1;
        }
        positions.needsUpdate = true;
      }
      host.dataset.scoreArmed = String(score.armed);
      host.dataset.scoreMode = score.mode;
      host.dataset.scoreCue = score.activeCue || "none";
      host.dataset.scoreLighting = score.lighting;
      host.dataset.scoreVfx = score.vfx;
      host.dataset.scoreSound = score.sound;
      host.dataset.scoreBeat = String(Math.floor((Date.now() - scoreOrigin) / beatDuration) % 4 + 1);
      if (hostAvatar && !reducedMotion) hostAvatar.position.y += Math.sin(elapsed * 1.6) * 0.00045;
      if (!reducedMotion) crane.rotation.y = current.cameraMotion.id === "crane-sweep" ? THREE.MathUtils.lerp(-0.72, 0.08, motionProgress) : -0.42 + Math.sin(elapsed * 0.18) * 0.08;
      renderer.render(scene, camera);
      host.dataset.frames = String(frame++);
      host.dataset.shot = current.shot;
      host.dataset.cameraMotion = motionPreset.id;
      host.dataset.cameraMotionProgress = rawMotionProgress.toFixed(3);
      host.dataset.live = String(current.live);
      if (frame % 30 === 0) {
        host.dataset.drawCalls = String(renderer.info.render.drawCalls);
        host.dataset.triangles = String(renderer.info.render.triangles);
        host.dataset.cameraOperators = String(operators.length);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    const refreshSponsor = () => { lastSponsor = ""; };
    brandImage.addEventListener("load", refreshSponsor);
    void renderer.init().then(() => {
      if (disposed) return;
      const backend = getRendererBackend(renderer);
      host.dataset.renderer = backend;
      onBackend?.(backend);
      setLoading(false);
      animate();
    }).catch((reason: unknown) => {
      setLoading(false);
      setError(reason instanceof Error ? reason.message : "The stage renderer could not initialize");
    });
    const resize = () => {
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.fov = portraitFov(camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      brandImage.removeEventListener("load", refreshSponsor);
      programScreensRef.current = [];
      const disposableTextures = new Set<THREE.Texture>(textures);
      const disposableMaterials = new Set<THREE.Material>(materials);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => {
          disposableMaterials.add(material);
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture) disposableTextures.add(value);
          });
        });
      });
      disposableTextures.forEach((texture) => texture.dispose());
      disposableMaterials.forEach((material) => material.dispose());
      confettiGeometry.dispose();
      void renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [onBackend, portraitFraming, reducedMotion]);

  return <div className="amx-xr-stage-scene" ref={hostRef} aria-label="AMX XR Stage live production venue">
    {loading && <div className="nexus-scene-loading"><span/><b>Building AMX XR Stage</b></div>}
    {error && <div className="nexus-scene-error">{error}</div>}
  </div>;
}

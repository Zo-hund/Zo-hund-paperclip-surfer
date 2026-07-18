import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SponsorCreative, StageMode, StageShot } from "./stage-production";
import { forceWebGLDiagnostic, getRendererBackend, type RendererBackend } from "./webgpu";

interface Props {
  mode: StageMode;
  shot: StageShot;
  sponsor: SponsorCreative;
  generalSeats: number;
  vipSeats: number;
  live: boolean;
  streams?: MediaStream[];
  reducedMotion?: boolean;
  onBackend?: (backend: RendererBackend) => void;
}

const SHOTS: Record<StageShot, { position: THREE.Vector3; target: THREE.Vector3; operator: number }> = {
  wide: { position: new THREE.Vector3(0, 5.4, 13.5), target: new THREE.Vector3(0, 2.3, -4.2), operator: 0 },
  host: { position: new THREE.Vector3(2.1, 2.45, 2.3), target: new THREE.Vector3(0, 2, -4.35), operator: 1 },
  audience: { position: new THREE.Vector3(0, 3.2, -2.1), target: new THREE.Vector3(0, 1.25, 6.1), operator: 2 },
  crane: { position: new THREE.Vector3(-8.4, 8.2, 8.4), target: new THREE.Vector3(0, 2, -3.4), operator: 0 },
};

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

function bindStream(mesh: THREE.Mesh, stream: MediaStream) {
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const previous = mesh.material;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
  mesh.material = material;
  void video.play().catch(() => undefined);
  return () => {
    video.pause();
    video.srcObject = null;
    texture.dispose();
    material.dispose();
    if (mesh.material === material) mesh.material = previous;
  };
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
    if (!(child instanceof THREE.Mesh)) return;
    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
    meshMaterials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
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

export function AMXXRStageScene({ mode, shot, sponsor, generalSeats, vipSeats, live, streams = [], reducedMotion, onBackend }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ mode, shot, sponsor, generalSeats, vipSeats, live });
  const programScreenRef = useRef<THREE.Mesh | null>(null);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { stateRef.current = { mode, shot, sponsor, generalSeats, vipSeats, live }; }, [generalSeats, live, mode, shot, sponsor, vipSeats]);

  useEffect(() => {
    const screen = programScreenRef.current;
    const stream = streams[0];
    if (!screen || !stream) return;
    return bindStream(screen, stream);
  }, [sceneGeneration, streams]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02070d);
    scene.fog = new THREE.FogExp2(0x02070d, 0.018);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / Math.max(1, host.clientHeight), 0.08, 120);
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

    scene.add(new THREE.HemisphereLight(0xbdefff, 0x02070d, 1.35));
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
    const programScreen = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.15), sponsorMaterial);
    programScreen.position.set(0, 4.15, -7.05);
    programScreenRef.current = programScreen;
    setSceneGeneration((generation) => generation + 1);
    scene.add(programScreen);
    const leftSponsor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.38), sponsorMaterial);
    leftSponsor.position.set(-6.45, 3.2, -5.6);
    leftSponsor.rotation.y = 0.38;
    const rightSponsor = leftSponsor.clone();
    rightSponsor.position.x = 6.45;
    rightSponsor.rotation.y = -0.38;
    scene.add(leftSponsor, rightSponsor);
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(19, 0.65), sponsorMaterial);
    ribbon.position.set(0, 7.05, -7.3);
    scene.add(ribbon);

    const seatGroups: THREE.Mesh[] = [];
    const seatOpen = new THREE.MeshStandardMaterial({ color: 0x15252d, roughness: 0.72, metalness: 0.25 });
    const seatFilled = new THREE.MeshStandardMaterial({ color: 0x287f91, roughness: 0.58, metalness: 0.22 });
    const seatVip = new THREE.MeshStandardMaterial({ color: 0xb98e35, roughness: 0.48, metalness: 0.44 });
    materials.push(seatOpen, seatFilled, seatVip);
    let generalIndex = 0;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 9; column++) {
        const x = (column - 4) * 1.18;
        const z = 4.1 + row * 1.55;
        const seat = box([0.78, 0.7, 0.76], [x, 0.46 + row * 0.13, z], seatOpen);
        seat.userData.seatType = "general";
        seat.userData.seatIndex = generalIndex++;
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
      seatGroups.push(seat);
      scene.add(seat);
    }

    const operators = [createCameraOperator(0), createCameraOperator(1), createCameraOperator(2)];
    operators[0].position.set(-4.5, 0, 1.5);
    operators[1].position.set(4.2, 0, -0.4);
    operators[2].position.set(6.1, 0, 5.2);
    operators.forEach((operator) => scene.add(operator));

    const crane = new THREE.Group();
    crane.name = "Camera_Crane";
    const craneArm = box([0.16, 0.16, 7.2], [0, 4.7, 0], darkMetal);
    craneArm.rotation.x = -0.35;
    crane.add(craneArm, box([0.9, 0.55, 0.8], [0, 3.45, -3.4], darkMetal));
    crane.position.set(-7.4, 0, 4.2);
    crane.rotation.y = -0.42;
    scene.add(crane);

    let hostAvatar: THREE.Object3D | null = null;
    new GLTFLoader().load("/models/zohund-avatar.glb", async (gltf) => {
      hostAvatar = gltf.scene;
      try {
        host.dataset.hostAvatarMaterials = String(await applyZohundTextures(hostAvatar));
      } catch {
        host.dataset.hostAvatarMaterials = "0";
      }
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
    let lastMode: StageMode | "" = "";
    const clock = new THREE.Clock();
    const animate = () => {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const current = stateRef.current;
      const targetShot = SHOTS[current.shot];
      const cameraEase = reducedMotion ? 1 : 0.055;
      camera.position.lerp(targetShot.position, cameraEase);
      const desired = new THREE.Matrix4().lookAt(camera.position, targetShot.target, camera.up);
      const desiredQuaternion = new THREE.Quaternion().setFromRotationMatrix(desired);
      camera.quaternion.slerp(desiredQuaternion, reducedMotion ? 1 : 0.08);

      const sponsorKey = `${current.sponsor.id}:${current.sponsor.headline}:${current.live}`;
      if (sponsorKey !== lastSponsor) {
        lastSponsor = sponsorKey;
        drawSponsor(sponsorCanvas, current.sponsor, brandImage, current.live);
        sponsorTexture.needsUpdate = true;
        host.dataset.sponsor = current.sponsor.id;
      }
      const seatKey = `${current.generalSeats}:${current.vipSeats}`;
      if (seatKey !== lastSeatState) {
        lastSeatState = seatKey;
        seatGroups.forEach((seat) => {
          const occupied = seat.userData.seatType === "vip" ? seat.userData.seatIndex < current.vipSeats : seat.userData.seatIndex < current.generalSeats;
          seat.material = occupied ? (seat.userData.seatType === "vip" ? seatVip : seatFilled) : seatOpen;
        });
        host.dataset.seats = seatKey;
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
      if (hostAvatar && !reducedMotion) hostAvatar.position.y += Math.sin(elapsed * 1.6) * 0.00045;
      if (!reducedMotion) crane.rotation.y = -0.42 + Math.sin(elapsed * 0.18) * 0.08;
      renderer.render(scene, camera);
      host.dataset.frames = String(frame++);
      host.dataset.shot = current.shot;
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
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      brandImage.removeEventListener("load", refreshSponsor);
      programScreenRef.current = null;
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
      void renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [onBackend, reducedMotion]);

  return <div className="amx-xr-stage-scene" ref={hostRef} aria-label="AMX XR Stage live production venue">
    {loading && <div className="nexus-scene-loading"><span/><b>Building AMX XR Stage</b></div>}
    {error && <div className="nexus-scene-error">{error}</div>}
  </div>;
}

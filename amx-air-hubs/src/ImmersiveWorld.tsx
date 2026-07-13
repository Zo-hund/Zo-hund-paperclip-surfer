import { useEffect, useRef, useState } from "react";
import { Hand, Move, Play, ScanLine } from "lucide-react";
import * as THREE from "three";
import type { ComfortSettings, ExperienceMode } from "./immersive";

interface Props {
  mode: Exclude<ExperienceMode, "2d" | "ar">;
  comfort: ComfortSettings;
  reducedMotion?: boolean;
  onInteract: (label: string) => void;
  onFallback: (mode: ExperienceMode, reason: string) => void;
}

function agentFigure(color: string, label: string) {
  const group = new THREE.Group();
  group.userData = { interactive: true, label };
  const shell = new THREE.MeshStandardMaterial({ color, metalness: 0.68, roughness: 0.24, emissive: color, emissiveIntensity: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x061017, metalness: 0.45, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 6, 14), shell);
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 14), shell);
  head.position.y = 1.05;
  head.scale.y = 0.78;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), dark);
  visor.position.set(0, 1.05, 0.21);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 8, 36), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  group.add(body, head, visor, ring);
  return group;
}

function portal(color: string, label: string) {
  const group = new THREE.Group();
  group.userData = { interactive: true, label };
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.045, 12, 64), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: 0.65, roughness: 0.2 }));
  ring.position.y = 1.05;
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.72, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  core.position.set(0, 1.05, -0.02);
  group.add(ring, core);
  return group;
}

export function ImmersiveWorld({ mode, comfort, reducedMotion, onInteract, onFallback }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const startXRRef = useRef<() => Promise<void>>(async () => undefined);
  const moveRef = useRef(new THREE.Vector3());
  const [sessionState, setSessionState] = useState<"preview" | "entering" | "live">("preview");
  const [selected, setSelected] = useState("Mission world ready");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = mode === "mr" ? null : new THREE.Color(0x04090d);
    scene.fog = new THREE.FogExp2(0x050b10, 0.035);
    const camera = new THREE.PerspectiveCamera(58, host.clientWidth / host.clientHeight, 0.05, 120);
    camera.position.set(0, comfort.posture === "seated" ? 1.25 : 1.65, 6.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: mode === "mr", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    renderer.domElement.className = "immersive-canvas";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xbfefff, 0x071017, 2.4));
    const cyanLight = new THREE.PointLight(0x55e6ff, 25, 18);
    cyanLight.position.set(-3, 4, 3);
    const magentaLight = new THREE.PointLight(0xff63de, 18, 16);
    magentaLight.position.set(4, 3, -2);
    const goldLight = new THREE.PointLight(0xf4c96b, 14, 14);
    goldLight.position.set(0, 2, -6);
    scene.add(cyanLight, magentaLight, goldLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 96),
      new THREE.MeshStandardMaterial({ color: 0x07161d, roughness: 0.78, metalness: 0.35, transparent: mode === "mr", opacity: mode === "mr" ? 0.58 : 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const grid = new THREE.GridHelper(30, 42, 0x55e6ff, 0x15323c);
    grid.position.y = 0.01;
    scene.add(grid);

    const portalData = [
      { color: "#55e6ff", label: "Build portal", position: [-3.1, 0, -4.4] },
      { color: "#ff63de", label: "Story portal", position: [0, 0, -6.2] },
      { color: "#f4c96b", label: "Proof portal", position: [3.1, 0, -4.4] },
    ] as const;
    const interactive: THREE.Object3D[] = [];
    portalData.forEach((item) => {
      const object = portal(item.color, item.label);
      object.position.set(item.position[0], item.position[1], item.position[2]);
      scene.add(object);
      interactive.push(object);
    });

    const crew = [
      { color: "#55e6ff", label: "JAZ / Learning Guide", x: -2.2 },
      { color: "#f4c96b", label: "TAZ / Project Manager", x: -0.72 },
      { color: "#ff7a66", label: "RAZ / Business Advisor", x: 0.72 },
      { color: "#79eea8", label: "NAZ / Game Master", x: 2.2 },
    ];
    const figures = crew.map((item) => {
      const figure = agentFigure(item.color, item.label);
      figure.position.set(item.x, 0, -1.25);
      scene.add(figure);
      interactive.push(figure);
      return figure;
    });

    let brandMark: THREE.Object3D | null = null;
    import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
      new GLTFLoader().load("/models/amx-mark.bin", (gltf) => {
        brandMark = gltf.scene;
        brandMark.scale.setScalar(0.7);
        brandMark.position.set(0, 3.5, -5.8);
        scene.add(brandMark);
      });
    });

    const keys = new Set<string>();
    const keyDown = (event: KeyboardEvent) => keys.add(event.key.toLowerCase());
    const keyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    let yaw = 0;
    let pointerX = 0;
    let dragging = false;
    const pointerDown = (event: PointerEvent) => { dragging = true; pointerX = event.clientX; };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging || renderer.xr.isPresenting) return;
      yaw -= (event.clientX - pointerX) * 0.004;
      pointerX = event.clientX;
    };
    const pointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(interactive, true)[0];
      let target: THREE.Object3D | null = hit?.object || null;
      while (target && !target.userData.label) target = target.parent;
      if (target?.userData.label) {
        setSelected(target.userData.label);
        onInteract(target.userData.label);
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);

    startXRRef.current = async () => {
      const xr = (navigator as Navigator & { xr?: { isSessionSupported: (kind: string) => Promise<boolean>; requestSession: (kind: string, options: unknown) => Promise<XRSession> } }).xr;
      const sessionMode = mode === "vr" ? "immersive-vr" : "immersive-ar";
      setSessionState("entering");
      try {
        if (!xr || !(await xr.isSessionSupported(sessionMode))) throw new Error(`${sessionMode} is unavailable`);
        const session = await xr.requestSession(sessionMode, {
          requiredFeatures: ["local-floor"],
          optionalFeatures: ["hand-tracking", "bounded-floor", "layers", "dom-overlay"],
          domOverlay: { root: document.body },
        });
        await renderer.xr.setSession(session);
        setSessionState("live");
        session.addEventListener("end", () => setSessionState("preview"));
      } catch (error) {
        setSessionState("preview");
        onFallback(mode === "vr" ? "3d" : "ar", error instanceof Error ? error.message : "XR session unavailable");
      }
    };

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05);
      const speed = (comfort.movementSpeed / 20) * delta;
      const move = moveRef.current;
      const forward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0) + move.z;
      const side = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0) + move.x;
      camera.position.x += (Math.cos(yaw) * side - Math.sin(yaw) * forward) * speed;
      camera.position.z += (Math.sin(yaw) * side + Math.cos(yaw) * -forward) * speed;
      camera.rotation.y = yaw;
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -8, 8);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -8, 8);
      move.multiplyScalar(0.78);
      if (!reducedMotion) {
        const elapsed = clock.elapsedTime;
        figures.forEach((figure, index) => { figure.position.y = Math.sin(elapsed * 1.4 + index) * 0.025; });
        if (brandMark) brandMark.rotation.y = Math.sin(elapsed * 0.35) * 0.3;
        interactive.slice(0, 3).forEach((object, index) => { object.rotation.z = Math.sin(elapsed * 0.55 + index) * 0.04; });
      }
      renderer.render(scene, camera);
    });

    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [comfort.movementSpeed, comfort.posture, mode, onFallback, onInteract, reducedMotion]);

  const nudge = (x: number, z: number) => moveRef.current.add(new THREE.Vector3(x, 0, z));
  return <div className={`immersive-world mode-${mode}`}>
    <div ref={hostRef} className="immersive-world-host" aria-label={`${mode.toUpperCase()} human-agent mission world`}/>
    <div className="world-signal"><span className="live-dot"/><b>{mode === "vr" ? "VR Skill Pod" : mode === "mr" ? "MR Workspace" : "Browser 3D World"}</b><small>{selected}</small></div>
    {(mode === "vr" || mode === "mr") && <button className="button primary compact xr-session-button" onClick={() => void startXRRef.current()} disabled={sessionState === "entering"}>
      {mode === "vr" ? <Play/> : <ScanLine/>}{sessionState === "live" ? "XR session live" : sessionState === "entering" ? "Checking headset" : `Enter ${mode.toUpperCase()}`}
    </button>}
    <div className="world-input-hint"><Move/><span>WASD / drag / touch</span><Hand/><span>Hands optional</span></div>
    <div className="touch-locomotion" aria-label="Touch locomotion controls">
      <button aria-label="Move forward" onPointerDown={() => nudge(0, 1)}>↑</button>
      <button aria-label="Move left" onPointerDown={() => nudge(-1, 0)}>←</button>
      <button aria-label="Move back" onPointerDown={() => nudge(0, -1)}>↓</button>
      <button aria-label="Move right" onPointerDown={() => nudge(1, 0)}>→</button>
    </div>
  </div>;
}

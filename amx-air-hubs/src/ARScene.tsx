import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ScanLine, Smartphone } from "lucide-react";
import type { Agent } from "./data";

interface Props {
  agent: Agent;
  onPlaced: () => void;
  textOnly?: boolean;
}

function buildAgent(agent: Agent) {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: agent.color, metalness: 0.72, roughness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x071017, metalness: 0.35, roughness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: agent.color, emissive: agent.color, emissiveIntensity: 2.4 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.52, 8, 16), shell);
  body.position.y = 0.82;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 18), shell);
  head.scale.y = 0.82;
  head.position.y = 1.52;
  group.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), dark);
  visor.position.set(0, 1.53, 0.3);
  group.add(visor);

  [-0.12, 0.12].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), glow);
    eye.position.set(x, 1.54, 0.35);
    group.add(eye);
  });

  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.44, 5, 10), shell);
    arm.position.set(side * 0.42, 0.92, 0);
    arm.rotation.z = side * -0.18;
    group.add(arm);
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.6, 0.12, 32), dark);
  base.position.y = 0.12;
  group.add(base);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.018, 8, 64), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  group.add(ring);

  group.visible = false;
  group.scale.setScalar(0.9);
  return group;
}

export function ARScene({ agent, onPlaced, textOnly }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placedRef = useRef(false);
  const onPlacedRef = useRef(onPlaced);
  const [mode, setMode] = useState<"preview" | "camera" | "xr">("preview");
  const [scenePlaced, setScenePlaced] = useState(false);
  const [message, setMessage] = useState("Tap the launch field to place your agent");
  useEffect(() => { onPlacedRef.current = onPlaced; }, [onPlaced]);
  const xrStartRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!hostRef.current || textOnly) return;
    const host = hostRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05090d, 0.08);
    const camera = new THREE.PerspectiveCamera(52, host.clientWidth / host.clientHeight, 0.01, 100);
    camera.position.set(0, 1.45, 4.2);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    renderer.domElement.className = "xr-canvas";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xc8f7ff, 0x0a1720, 2.8));
    const key = new THREE.DirectionalLight(agent.color, 4);
    key.position.set(2, 4, 3);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x07131a, roughness: 0.82, metalness: 0.25, transparent: true, opacity: 0.86 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const grid = new THREE.GridHelper(6, 18, agent.color, 0x15323c);
    grid.position.y = 0.006;
    scene.add(grid);

    const agentGroup = buildAgent(agent);
    scene.add(agentGroup);

    let brandMark: THREE.Object3D | null = null;
    import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
      new GLTFLoader().load("/models/amx-mark.bin", (gltf) => {
        brandMark = gltf.scene;
        brandMark.scale.setScalar(0.28);
        brandMark.position.set(0, 2.45, -0.45);
        brandMark.visible = false;
        scene.add(brandMark);
      });
    });

    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.13, 0.18, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: agent.color }),
    );
    reticle.visible = false;
    reticle.matrixAutoUpdate = false;
    scene.add(reticle);

    const place = () => {
      if (placedRef.current) return;
      placedRef.current = true;
      setScenePlaced(true);
      agentGroup.visible = true;
      if (brandMark) brandMark.visible = true;
      agentGroup.position.set(0, 0, 0);
      setMessage(`${agent.name} placed. Walk around and inspect the station.`);
      onPlacedRef.current();
    };
    renderer.domElement.addEventListener("pointerdown", place);

    let hitSource: any = null;
    let localSpace: any = null;
    let viewerSpace: any = null;
    let xrSession: any = null;

    xrStartRef.current = async () => {
      const xr = (navigator as any).xr;
      if (!xr || !(await xr.isSessionSupported("immersive-ar"))) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          scene.background = null;
          floor.material instanceof THREE.Material && (floor.material.transparent = true);
          setMode("camera");
          setMessage("Camera mode ready. Tap a safe floor area.");
        } catch {
          setMessage("Camera access is unavailable. Preview mode remains active.");
        }
        return;
      }
      xrSession = await xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "local-floor"],
        domOverlay: { root: document.body },
      });
      await renderer.xr.setSession(xrSession);
      viewerSpace = await xrSession.requestReferenceSpace("viewer");
      localSpace = await xrSession.requestReferenceSpace("local");
      hitSource = await xrSession.requestHitTestSource({ space: viewerSpace });
      setMode("xr");
      setMessage("Move your phone to scan a surface, then tap to place.");
      xrSession.addEventListener("select", () => {
        if (!reticle.visible || placedRef.current) return;
        placedRef.current = true;
      setScenePlaced(true);
      agentGroup.visible = true;
        if (brandMark) brandMark.visible = true;
        agentGroup.position.setFromMatrixPosition(reticle.matrix);
        onPlacedRef.current();
        setMessage(`${agent.name} is anchored in your space.`);
      });
    };

    const clock = new THREE.Clock();
    renderer.setAnimationLoop((_, frame) => {
      if (frame && hitSource && localSpace && !placedRef.current) {
        const results = frame.getHitTestResults(hitSource);
        if (results.length) {
          const pose = results[0].getPose(localSpace);
          reticle.visible = Boolean(pose);
          if (pose) reticle.matrix.fromArray(pose.transform.matrix);
        } else reticle.visible = false;
      }
      if (agentGroup.visible) {
        agentGroup.position.y += Math.sin(clock.elapsedTime * 2) * 0.0008;
        agentGroup.rotation.y = mode === "preview" ? Math.sin(clock.elapsedTime * 0.55) * 0.22 : agentGroup.rotation.y;
      }
      if (brandMark?.visible) brandMark.rotation.y = clock.elapsedTime * 0.35;
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
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", place);
      renderer.dispose();
      xrSession?.end();
      if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      host.removeChild(renderer.domElement);
    };
  }, [agent, textOnly]);

  if (textOnly) {
    return <div className="text-only-scene"><ScanLine size={28}/><strong>Text-only mission mode</strong><p>Spatial scene is disabled. Complete each guided checkpoint from the mission panel.</p><button className="button primary" onClick={onPlaced}>Confirm agent placement</button></div>;
  }

  return (
    <div className="xr-stage">
      <video ref={videoRef} className="camera-feed" muted playsInline aria-hidden="true" />
      <div ref={hostRef} className="xr-host" aria-label="Interactive 3D agent placement scene" />
      <div className="xr-mode"><span className="live-dot"/>{mode === "xr" ? "WebXR live" : mode === "camera" ? "Camera AR" : "Spatial preview"}</div>
      <div className="scan-reticle" aria-hidden="true"><span/><span/><span/><span/></div>
      <div className="xr-instruction">
        <Smartphone size={18}/><span>{message}</span>
        {mode === "preview" && !scenePlaced && <button className="button compact primary" onClick={() => xrStartRef.current?.()}>Enter AR</button>}
      </div>
    </div>
  );
}

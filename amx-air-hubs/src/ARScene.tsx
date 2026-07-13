import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Camera, RotateCcw, ScanLine, Smartphone } from "lucide-react";
import type { Agent } from "./data";
import type { GeoAnchor } from "./geospatial";

export interface ARAnchorPlacement {
  localPosition: [number, number, number];
  orientation: [number, number, number, number];
  source: "webxr" | "camera";
  persistentHandle?: string;
}

interface Props {
  agent: Agent;
  onPlaced: () => void;
  onSessionStart?: () => void;
  onAnchorPlaced?: (placement: ARAnchorPlacement) => void;
  anchors?: GeoAnchor[];
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

function buildAnchorMarker(color: number) {
  const marker = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 36), material);
  ring.rotation.x = Math.PI / 2;
  marker.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 8), material);
  beam.position.y = 0.25;
  marker.add(beam);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), material);
  beacon.position.y = 0.52;
  marker.add(beacon);
  return marker;
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Camera permission is blocked. Allow camera access in this site's browser settings, then retry.";
  if (name === "NotFoundError") return "No usable camera was found on this device.";
  if (name === "NotReadableError") return "The camera is busy in another app. Close it there, then retry.";
  if (!window.isSecureContext) return "Camera AR requires HTTPS or localhost.";
  return error instanceof Error ? `Camera could not start: ${error.message}` : "Camera could not start on this device.";
}

export function ARScene({ agent, onPlaced, onSessionStart, onAnchorPlaced, anchors = [], textOnly }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placedRef = useRef(false);
  const anchorsRef = useRef(anchors);
  const onPlacedRef = useRef(onPlaced);
  const onSessionStartRef = useRef(onSessionStart);
  const onAnchorPlacedRef = useRef(onAnchorPlaced);
  const modeRef = useRef<"preview" | "camera" | "xr">("preview");
  const [mode, setMode] = useState<"preview" | "camera" | "xr">("preview");
  const [scenePlaced, setScenePlaced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Tap Enter AR to open the camera, then place your agent");
  const xrStartRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => { onPlacedRef.current = onPlaced; }, [onPlaced]);
  useEffect(() => { onSessionStartRef.current = onSessionStart; }, [onSessionStart]);
  useEffect(() => { onAnchorPlacedRef.current = onAnchorPlaced; }, [onAnchorPlaced]);
  useEffect(() => { anchorsRef.current = anchors; }, [anchors]);

  useEffect(() => {
    if (!hostRef.current || textOnly) return;
    placedRef.current = false;
    const host = hostRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05090d, 0.08);
    const camera = new THREE.PerspectiveCamera(52, host.clientWidth / host.clientHeight, 0.01, 250);
    camera.position.set(0, 1.45, 4.2);
    camera.lookAt(0, 0.9, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
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
      new THREE.MeshStandardMaterial({ color: 0x07131a, roughness: 0.82, metalness: 0.25, transparent: true, opacity: 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const grid = new THREE.GridHelper(6, 18, agent.color, 0x15323c);
    grid.position.y = 0.006;
    scene.add(grid);
    const agentGroup = buildAgent(agent);
    scene.add(agentGroup);
    const anchorLayer = new THREE.Group();
    scene.add(anchorLayer);
    const remoteMarkers = new Map<string, THREE.Group>();

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

    let hitSource: any = null;
    let localSpace: any = null;
    let xrSession: any = null;
    let lastHitResult: any = null;
    let nativeAnchor: any = null;
    let cameraStream: MediaStream | null = null;

    const commitPlacement = (position: THREE.Vector3, quaternion: THREE.Quaternion, source: "webxr" | "camera", persistentHandle?: string) => {
      if (placedRef.current) return;
      placedRef.current = true;
      setScenePlaced(true);
      agentGroup.visible = true;
      if (brandMark) brandMark.visible = true;
      agentGroup.position.copy(position);
      agentGroup.quaternion.copy(quaternion);
      onPlacedRef.current();
      onAnchorPlacedRef.current?.({
        localPosition: [position.x, position.y, position.z],
        orientation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
        source,
        persistentHandle,
      });
      setMessage(source === "webxr" ? `${agent.name} is anchored in your space.` : `${agent.name} placed in camera AR.`);
    };

    const placeFromPointer = () => {
      if (modeRef.current === "xr" || placedRef.current) return;
      commitPlacement(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), modeRef.current === "camera" ? "camera" : "camera");
    };
    renderer.domElement.addEventListener("pointerdown", placeFromPointer);

    const startCamera = async (xrError?: unknown) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage(window.isSecureContext ? "This browser does not expose a camera API." : "Camera AR requires HTTPS or localhost.");
        return;
      }
      try {
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = cameraStream;
        await videoRef.current.play();
        modeRef.current = "camera";
        setMode("camera");
        floor.material.opacity = 0.38;
        grid.material instanceof THREE.Material && (grid.material.opacity = 0.38);
        setMessage(xrError ? "WebXR was unavailable, so camera AR is live. Tap a safe floor area." : "Camera AR is live. Tap a safe floor area.");
      } catch (error) {
        modeRef.current = "preview";
        setMode("preview");
        setMessage(cameraErrorMessage(error));
      }
    };

    xrStartRef.current = async () => {
      setBusy(true);
      setMessage("Requesting spatial camera access...");
      onSessionStartRef.current?.();
      try {
        const xr = (navigator as Navigator & { xr?: any }).xr;
        const supported = xr ? await xr.isSessionSupported("immersive-ar").catch(() => false) : false;
        if (!xr || !supported) {
          await startCamera();
          return;
        }
        try {
          xrSession = await xr.requestSession("immersive-ar", {
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["anchors", "dom-overlay", "local-floor", "bounded-floor"],
            domOverlay: { root: document.body },
          });
        } catch (error) {
          await startCamera(error);
          return;
        }
        await renderer.xr.setSession(xrSession);
        const viewerSpace = await xrSession.requestReferenceSpace("viewer");
        localSpace = await xrSession.requestReferenceSpace("local-floor").catch(() => xrSession.requestReferenceSpace("local"));
        hitSource = await xrSession.requestHitTestSource({ space: viewerSpace });
        modeRef.current = "xr";
        setMode("xr");
        setMessage("Move your phone to scan a surface, then tap to place.");
        xrSession.addEventListener("end", () => {
          hitSource = null;
          localSpace = null;
          modeRef.current = "preview";
          setMode("preview");
          if (!placedRef.current) setMessage("AR session ended. Retry to reopen the camera.");
        });
        xrSession.addEventListener("select", async () => {
          if (!reticle.visible || placedRef.current) return;
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          reticle.matrix.decompose(position, quaternion, scale);
          let persistentHandle: string | undefined;
          try {
            if (lastHitResult?.createAnchor) {
              nativeAnchor = await lastHitResult.createAnchor();
              if (nativeAnchor?.requestPersistentHandle) persistentHandle = await nativeAnchor.requestPersistentHandle();
            }
          } catch {
            nativeAnchor = null;
          }
          commitPlacement(position, quaternion, "webxr", persistentHandle);
        });
      } finally {
        setBusy(false);
      }
    };

    const clock = new THREE.Clock();
    let markerFrame = 0;
    renderer.setAnimationLoop((_, frame) => {
      if (frame && hitSource && localSpace && !placedRef.current) {
        const results = frame.getHitTestResults(hitSource);
        lastHitResult = results[0] || null;
        const pose = lastHitResult?.getPose(localSpace);
        reticle.visible = Boolean(pose);
        if (pose) reticle.matrix.fromArray(pose.transform.matrix);
      }
      if (frame && nativeAnchor?.anchorSpace && localSpace) {
        const pose = frame.getPose(nativeAnchor.anchorSpace, localSpace);
        if (pose) {
          const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
          matrix.decompose(agentGroup.position, agentGroup.quaternion, agentGroup.scale);
          agentGroup.scale.setScalar(0.9);
        }
      }
      markerFrame += 1;
      if (markerFrame % 30 === 0) {
        const currentIds = new Set(anchorsRef.current.map((anchor) => anchor.id));
        for (const [id, marker] of remoteMarkers) if (!currentIds.has(id)) { anchorLayer.remove(marker); remoteMarkers.delete(id); }
        anchorsRef.current.forEach((anchor) => {
          let marker = remoteMarkers.get(anchor.id);
          if (!marker) { marker = buildAnchorMarker(anchor.source === "webxr" ? new THREE.Color(agent.color).getHex() : 0xf4c96b); remoteMarkers.set(anchor.id, marker); anchorLayer.add(marker); }
          marker.position.fromArray(anchor.localPosition);
          marker.quaternion.fromArray(anchor.orientation);
        });
      }
      if (agentGroup.visible) {
        if (!nativeAnchor) agentGroup.position.y += Math.sin(clock.elapsedTime * 2) * 0.0008;
        if (modeRef.current === "preview") agentGroup.rotation.y = Math.sin(clock.elapsedTime * 0.55) * 0.22;
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
      renderer.domElement.removeEventListener("pointerdown", placeFromPointer);
      renderer.dispose();
      void xrSession?.end();
      cameraStream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      xrStartRef.current = null;
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [agent, textOnly]);

  if (textOnly) {
    return <div className="text-only-scene"><ScanLine size={28}/><strong>Text-only mission mode</strong><p>Spatial scene is disabled. Complete each guided checkpoint from the mission panel.</p><button className="button primary" onClick={onPlaced}>Confirm agent placement</button></div>;
  }

  return (
    <div className="xr-stage">
      <video ref={videoRef} className="camera-feed" autoPlay muted playsInline aria-label="Live camera view for augmented reality" />
      <div ref={hostRef} className="xr-host" aria-label="Interactive Three.js agent placement scene" />
      <div className="xr-mode"><span className="live-dot"/>{mode === "xr" ? "WebXR + anchors" : mode === "camera" ? "Camera AR live" : "Three.js preview"}</div>
      <div className="scan-reticle" aria-hidden="true"><span/><span/><span/><span/></div>
      <div className="xr-instruction">
        <Smartphone size={18}/><span>{message}</span>
        {mode === "preview" && !scenePlaced && <button className="button compact primary" disabled={busy} onClick={() => xrStartRef.current?.()}>{busy ? <ScanLine/> : message.includes("blocked") || message.includes("could not") ? <RotateCcw/> : <Camera/>}{busy ? "Opening" : message.includes("blocked") || message.includes("could not") ? "Retry" : "Enter AR"}</button>}
      </div>
    </div>
  );
}

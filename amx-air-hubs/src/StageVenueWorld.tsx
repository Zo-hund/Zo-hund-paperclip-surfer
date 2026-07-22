import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { StageVenueLayout } from "./stage-events";
import type { StageProductionState } from "./stage-production";
import type { StageVenuePose } from "./stage-venue-presence";

export type StageVenueXRMode = "web" | "ar" | "vr" | "mr";
export interface StageVenueControls {
  enter: (mode: StageVenueXRMode) => Promise<string>;
  move: (forward: number, right: number) => void;
  turn: (direction: -1 | 1) => void;
  recenter: () => void;
}

interface Props {
  layout: StageVenueLayout;
  production: StageProductionState;
  participants: StageVenuePose[];
  reducedMotion?: boolean;
  onPose: (position: [number, number, number], yaw: number) => void;
  onReady: (controls: StageVenueControls | null) => void;
}

const COLORS = { cyan: 0x55e6ff, magenta: 0xff63de, green: 0x79eea8, gold: 0xf4c96b };

function material(color: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, emissive: emissive || color, emissiveIntensity: emissive ? .45 : 0, metalness: .34, roughness: .48 });
}

function box(scene: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: number, emissive = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, emissive));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function avatarLabel(name: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(3,10,14,.86)"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = color; context.lineWidth = 5; context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    context.fillStyle = "#effbfc"; context.font = "700 34px Arial"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(name.slice(0, 24), canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, .45, 1);
  sprite.position.y = 2.45;
  return sprite;
}

function buildVenue(root: THREE.Group, layout: StageVenueLayout) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x071218, metalness: .25, roughness: .78 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "VenueFloor";
  root.add(floor);
  const grid = new THREE.GridHelper(56, 56, 0x315967, 0x162b33);
  grid.position.y = .012;
  root.add(grid);

  box(root, [15, .8, 5], [0, .4, -11], 0x101e27);
  box(root, [13.5, 5.8, .45], [0, 4, -13.2], 0x06131b);
  box(root, [12.7, 5, .12], [0, 4, -12.92], 0x183b49, COLORS.cyan);
  [-7.1, 7.1].forEach((x) => box(root, [.22, 6.5, .22], [x, 3.25, -12.6], COLORS.magenta, COLORS.magenta));

  if (layout === "theater") {
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 9; column += 1) {
      const seat = box(root, [.72, .55, .72], [(column - 4) * 1.15, .32 + row * .08, -5 + row * 1.75], row === 0 ? 0x6b5524 : 0x16303a);
      seat.rotation.y = 0;
    }
  } else if (layout === "arena") {
    for (let index = 0; index < 32; index += 1) {
      const angle = index / 32 * Math.PI * 2;
      const radius = index % 2 ? 8.4 : 10;
      const seat = box(root, [.7, .56, .7], [Math.sin(angle) * radius, .34, -3 + Math.cos(angle) * radius], index < 8 ? 0x6b5524 : 0x222940);
      seat.rotation.y = angle;
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.2, .08, 10, 80), new THREE.MeshBasicMaterial({ color: COLORS.magenta }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, .08, -3); root.add(ring);
  } else {
    const boothColors = [COLORS.cyan, COLORS.magenta, COLORS.green, COLORS.gold, 0x9f8cff, 0xff7d66];
    for (let index = 0; index < 6; index += 1) {
      const side = index % 2 ? 1 : -1;
      const row = Math.floor(index / 2);
      const group = new THREE.Group();
      group.position.set(side * 7.5, 0, -6 + row * 6);
      box(group, [4.6, .25, 3.8], [0, .12, 0], 0x10212a);
      box(group, [4.6, 2.7, .18], [0, 1.5, -1.82], boothColors[index], boothColors[index]);
      box(group, [1.8, 1, .8], [0, .5, -.7], 0x1b3039);
      root.add(group);
    }
  }

  return floor;
}

export function StageVenueWorld({ layout, production, participants, reducedMotion, onPose, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const participantsRef = useRef(participants);
  const productionRef = useRef(production);
  const onPoseRef = useRef(onPose);
  const onReadyRef = useRef(onReady);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { productionRef.current = production; }, [production]);
  useEffect(() => { onPoseRef.current = onPose; }, [onPose]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const background = new THREE.Color(0x02070d);
    scene.background = background;
    scene.fog = new THREE.Fog(0x02070d, 22, 58);
    const camera = new THREE.PerspectiveCamera(68, mount.clientWidth / mount.clientHeight, .05, 100);
    camera.position.set(0, 1.65, 0);
    const player = new THREE.Group();
    player.position.set(0, 0, 9);
    player.add(camera);
    scene.add(player);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "stage-venue-canvas";
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xcceeff, 0x15091d, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(8, 16, 6); key.castShadow = true; scene.add(key);
    const cyan = new THREE.PointLight(COLORS.cyan, 34, 30); cyan.position.set(-7, 7, -8); scene.add(cyan);
    const magenta = new THREE.PointLight(COLORS.magenta, 28, 26); magenta.position.set(7, 5, -5); scene.add(magenta);
    const venue = new THREE.Group(); scene.add(venue);
    const floor = buildVenue(venue, layout);

    const programCanvas = document.createElement("canvas"); programCanvas.width = 1280; programCanvas.height = 720;
    const programTexture = new THREE.CanvasTexture(programCanvas); programTexture.colorSpace = THREE.SRGBColorSpace;
    const programScreen = new THREE.Mesh(new THREE.PlaneGeometry(12.7, 5), new THREE.MeshBasicMaterial({ map: programTexture, toneMapped: false }));
    programScreen.position.set(0, 4, -12.84); venue.add(programScreen);

    const remoteAvatars = new Map<string, THREE.Group>();
    const syncAvatars = () => {
      const activeIds = new Set(participantsRef.current.map((participant) => participant.id));
      remoteAvatars.forEach((avatar, id) => { if (!activeIds.has(id)) { scene.remove(avatar); remoteAvatars.delete(id); } });
      participantsRef.current.forEach((participant) => {
        let avatar = remoteAvatars.get(participant.id);
        if (!avatar) {
          avatar = new THREE.Group();
          const color = new THREE.Color(participant.color);
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .75, 5, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .24, roughness: .55 }));
          body.position.y = 1.1;
          const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd7a27e, roughness: .82 }));
          head.position.y = 1.78;
          avatar.add(body, head, avatarLabel(participant.name, participant.color));
          remoteAvatars.set(participant.id, avatar); scene.add(avatar);
        }
        avatar.position.set(...participant.position);
        avatar.rotation.y = participant.yaw;
      });
    };

    const floorRaycaster = new THREE.Raycaster();
    const controllerMatrix = new THREE.Matrix4();
    const teleport = (event: THREE.Event & { target: THREE.Object3D }) => {
      const controller = event.target;
      controllerMatrix.identity().extractRotation(controller.matrixWorld);
      floorRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      floorRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(controllerMatrix);
      const hit = floorRaycaster.intersectObject(floor, false)[0];
      if (!hit) return;
      player.position.x = Math.max(-26, Math.min(26, hit.point.x));
      player.position.z = Math.max(-24, Math.min(24, hit.point.z));
    };
    const controllers = [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -5)]), new THREE.LineBasicMaterial({ color: index ? COLORS.magenta : COLORS.cyan }));
      controller.add(ray); controller.addEventListener("select", teleport); scene.add(controller); return controller;
    });

    const clampPlayer = () => { player.position.x = Math.max(-27, Math.min(27, player.position.x)); player.position.z = Math.max(-25, Math.min(25, player.position.z)); };
    const move = (forward: number, right: number) => {
      const direction = new THREE.Vector3(right, 0, -forward).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
      player.position.addScaledVector(direction, .55); clampPlayer();
    };
    const turn = (direction: -1 | 1) => { player.rotation.y -= direction * Math.PI / 6; };
    const recenter = () => { player.position.set(0, 0, 9); player.rotation.set(0, 0, 0); };
    const enter: StageVenueControls["enter"] = async (mode) => {
      if (mode === "web") { await renderer.xr.getSession()?.end(); return "Browser venue active."; }
      if (!isSecureContext) return "WebXR needs HTTPS or localhost.";
      if (!navigator.xr) return "WebXR is unavailable in this browser. Browser venue remains active.";
      const sessionMode: XRSessionMode = mode === "vr" ? "immersive-vr" : "immersive-ar";
      if (!await navigator.xr.isSessionSupported(sessionMode)) return `${mode.toUpperCase()} is not supported on this device.`;
      await renderer.xr.getSession()?.end();
      const session = await navigator.xr.requestSession(sessionMode, { requiredFeatures: ["local-floor"], optionalFeatures: ["bounded-floor", "hand-tracking", "hit-test", "anchors", "dom-overlay"], domOverlay: { root: mount.closest(".stage-venue-page") as Element } });
      scene.background = sessionMode === "immersive-ar" ? null : background;
      session.addEventListener("end", () => { scene.background = background; });
      await renderer.xr.setSession(session);
      return `${mode.toUpperCase()} active. Left stick moves, right stick snap-turns, and either trigger teleports.`;
    };
    onReadyRef.current({ enter, move, turn, recenter });

    const keys = new Set<string>();
    const keydown = (event: KeyboardEvent) => { if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) keys.add(event.code); };
    const keyup = (event: KeyboardEvent) => keys.delete(event.code);
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    const clock = new THREE.Clock();
    let turnLatch = false;
    let lastProgramRevision = 0;
    const render = () => {
      const delta = Math.min(.05, clock.getDelta());
      if (keys.has("KeyW") || keys.has("ArrowUp")) move(delta * 3.2, 0);
      if (keys.has("KeyS") || keys.has("ArrowDown")) move(-delta * 3.2, 0);
      if (keys.has("KeyA")) move(0, -delta * 3.2);
      if (keys.has("KeyD")) move(0, delta * 3.2);
      if (keys.has("ArrowLeft")) player.rotation.y += delta * 1.5;
      if (keys.has("ArrowRight")) player.rotation.y -= delta * 1.5;
      const session = renderer.xr.getSession();
      if (session) {
        for (const source of session.inputSources) {
          const axes = source.gamepad?.axes || [];
          const horizontal = axes.length > 2 ? axes[2] : axes[0] || 0;
          const vertical = axes.length > 3 ? axes[3] : axes[1] || 0;
          if (source.handedness === "left" && (Math.abs(horizontal) > .16 || Math.abs(vertical) > .16)) move(-vertical * delta * 3.6, horizontal * delta * 3.6);
          if (source.handedness === "right") {
            if (Math.abs(horizontal) > .72 && !turnLatch) { turn(horizontal > 0 ? 1 : -1); turnLatch = true; }
            if (Math.abs(horizontal) < .3) turnLatch = false;
          }
        }
      }
      const current = productionRef.current;
      if (current.revision !== lastProgramRevision) {
        lastProgramRevision = current.revision;
        const context = programCanvas.getContext("2d");
        if (context) {
          context.fillStyle = "#030a0f"; context.fillRect(0, 0, programCanvas.width, programCanvas.height);
          context.fillStyle = current.sponsor.accent; context.fillRect(0, 0, 20, programCanvas.height);
          context.fillStyle = "#55e6ff"; context.font = "700 34px Arial"; context.fillText(`AMX XR STAGE / ${current.event.venueLayout.toUpperCase()}`, 70, 92);
          context.fillStyle = "#f4fbfc"; context.font = "800 72px Arial"; context.fillText(current.event.title.slice(0, 31), 70, 205);
          context.fillStyle = current.live ? "#ff6d73" : "#79eea8"; context.font = "700 34px Arial"; context.fillText(current.live ? "LIVE PROGRAM" : current.event.status.toUpperCase(), 70, 282);
          context.fillStyle = "#a7bac0"; context.font = "600 30px Arial"; context.fillText(`${current.sponsor.name} / ${current.cue.toUpperCase()} / ${current.shot.toUpperCase()} CAMERA`, 70, 355);
          context.fillStyle = current.sponsor.accent; context.font = "700 42px Arial"; context.fillText(current.sponsor.headline.slice(0, 44), 70, 520);
          context.fillStyle = "#f4fbfc"; context.font = "700 28px Arial"; context.fillText(current.sponsor.cta.slice(0, 56), 70, 590);
          programTexture.needsUpdate = true;
        }
      }
      syncAvatars();
      if (!reducedMotion) venue.rotation.y = Math.sin(clock.elapsedTime * .18) * .002;
      onPoseRef.current([player.position.x, 0, player.position.z], player.rotation.y);
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(render);
    const resize = () => { if (!mount.clientWidth || !mount.clientHeight) return; camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(mount);
    return () => {
      onReadyRef.current(null); renderer.setAnimationLoop(null); observer.disconnect();
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup);
      controllers.forEach((controller) => controller.removeEventListener("select", teleport));
      scene.traverse((object) => { if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return; const geometry = "geometry" in object ? object.geometry as THREE.BufferGeometry : null; geometry?.dispose(); const source = "material" in object ? object.material as THREE.Material | THREE.Material[] : []; (Array.isArray(source) ? source : [source]).forEach((entry) => entry?.dispose()); });
      programTexture.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [layout, reducedMotion]);

  return <div className="stage-venue-world" ref={mountRef} aria-label={`${layout} multiplayer WebXR venue`}/>;
}

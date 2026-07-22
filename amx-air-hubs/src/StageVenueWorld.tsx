import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { StageVenueLayout } from "./stage-events";
import type { StageProductionState } from "./stage-production";
import type { StageVenuePose } from "./stage-venue-presence";
import type { NpcCommand, NpcRuntimeState } from "./npc-controller";
import { isSafeVenuePoint, resolveVenueMovement, type StageVenueOperatorCommand, type VenueCollider, type VenueFollowTarget } from "./stage-venue-production";

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
  operator?: boolean;
  npcCommand?: NpcCommand | null;
  followTarget?: VenueFollowTarget;
  onOperatorCommand?: (command: StageVenueOperatorCommand) => void;
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
  const colliders: VenueCollider[] = [{ minX: -7.5, maxX: 7.5, minZ: -13.8, maxZ: -8.45 }];
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
      colliders.push({ minX: seat.position.x - .42, maxX: seat.position.x + .42, minZ: seat.position.z - .42, maxZ: seat.position.z + .42 });
    }
  } else if (layout === "arena") {
    for (let index = 0; index < 32; index += 1) {
      const angle = index / 32 * Math.PI * 2;
      const radius = index % 2 ? 8.4 : 10;
      const seat = box(root, [.7, .56, .7], [Math.sin(angle) * radius, .34, -3 + Math.cos(angle) * radius], index < 8 ? 0x6b5524 : 0x222940);
      seat.rotation.y = angle;
      colliders.push({ minX: seat.position.x - .42, maxX: seat.position.x + .42, minZ: seat.position.z - .42, maxZ: seat.position.z + .42 });
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
      colliders.push({ minX: group.position.x - 2.45, maxX: group.position.x + 2.45, minZ: group.position.z - 2, maxZ: group.position.z + 2 });
    }
  }

  return { floor, colliders };
}

const OPERATOR_BUTTONS: { label: string; command: StageVenueOperatorCommand }[] = [
  { label: "WIDE", command: { kind: "shot", shot: "wide" } },
  { label: "HOST", command: { kind: "shot", shot: "host" } },
  { label: "AUDIENCE", command: { kind: "shot", shot: "audience" } },
  { label: "CRANE", command: { kind: "shot", shot: "crane" } },
  { label: "FOLLOW HOST", command: { kind: "follow", target: "host" } },
  { label: "FOLLOW CREW", command: { kind: "follow", target: "crew" } },
  { label: "CRANE REVEAL", command: { kind: "motion", motion: "crane-reveal" } },
  { label: "DOLLY PUSH", command: { kind: "motion", motion: "dolly-push" } },
  { label: "GO LIVE", command: { kind: "show", action: "go-live" } },
  { label: "NEXT CUE", command: { kind: "show", action: "next-cue" } },
  { label: "NPC STAGE", command: { kind: "npc", action: "stage" } },
  { label: "NPC WAVE", command: { kind: "npc", action: "wave" } },
  { label: "CALL CREW", command: { kind: "crew", action: "call" } },
  { label: "HOLD CREW", command: { kind: "crew", action: "hold" } },
  { label: "NPC PATROL", command: { kind: "npc", action: "patrol" } },
  { label: "VOICE CONTROL", command: { kind: "voice", action: "toggle" } },
];

function operatorPanel() {
  const group = new THREE.Group();
  group.name = "VenueOperatorConsole";
  group.visible = false;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(4.35, 3.6), new THREE.MeshBasicMaterial({ color: 0x030a0f, transparent: true, opacity: .94, side: THREE.DoubleSide }));
  group.add(back);
  const buttons = OPERATOR_BUTTONS.map((control, index) => {
    const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) { context.fillStyle = "#0b2029"; context.fillRect(0, 0, 384, 128); context.strokeStyle = "#55e6ff"; context.lineWidth = 5; context.strokeRect(3, 3, 378, 122); context.fillStyle = "#effbfc"; context.font = "700 28px Arial"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(control.label, 192, 64); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, .43), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    mesh.position.set((index % 3 - 1) * 1.35, 1.35 - Math.floor(index / 3) * .55, .02);
    mesh.userData.operatorCommand = control.command;
    group.add(mesh);
    return mesh;
  });
  return { group, buttons };
}

export function StageVenueWorld({ layout, production, participants, reducedMotion, operator = false, npcCommand, followTarget = "off", onOperatorCommand, onPose, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const participantsRef = useRef(participants);
  const productionRef = useRef(production);
  const onPoseRef = useRef(onPose);
  const onReadyRef = useRef(onReady);
  const operatorRef = useRef(operator);
  const npcCommandRef = useRef(npcCommand);
  const followTargetRef = useRef(followTarget);
  const onOperatorCommandRef = useRef(onOperatorCommand);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { productionRef.current = production; }, [production]);
  useEffect(() => { onPoseRef.current = onPose; }, [onPose]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { operatorRef.current = operator; }, [operator]);
  useEffect(() => { npcCommandRef.current = npcCommand; }, [npcCommand]);
  useEffect(() => { followTargetRef.current = followTarget; }, [followTarget]);
  useEffect(() => { onOperatorCommandRef.current = onOperatorCommand; }, [onOperatorCommand]);

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
    const { floor, colliders } = buildVenue(venue, layout);

    const programCanvas = document.createElement("canvas"); programCanvas.width = 1280; programCanvas.height = 720;
    const programTexture = new THREE.CanvasTexture(programCanvas); programTexture.colorSpace = THREE.SRGBColorSpace;
    const programScreen = new THREE.Mesh(new THREE.PlaneGeometry(12.7, 5), new THREE.MeshBasicMaterial({ map: programTexture, toneMapped: false }));
    programScreen.position.set(0, 4, -12.84); venue.add(programScreen);

    const npcRoot = new THREE.Group();
    npcRoot.position.set(-2.1, 0, -7.4);
    const npcColor = new THREE.Color(COLORS.magenta);
    const npcBody = new THREE.Mesh(new THREE.CapsuleGeometry(.3, .9, 6, 12), new THREE.MeshStandardMaterial({ color: npcColor, emissive: npcColor, emissiveIntensity: .3, roughness: .46 }));
    npcBody.position.y = 1.12;
    const npcHead = new THREE.Mesh(new THREE.SphereGeometry(.23, 18, 14), new THREE.MeshStandardMaterial({ color: 0x263e48, emissive: COLORS.cyan, emissiveIntensity: .55 }));
    npcHead.position.y = 1.88;
    npcRoot.add(npcBody, npcHead, avatarLabel("JAZ / PRODUCTION AGENT", "#ff63de"));
    scene.add(npcRoot);
    const npcState: NpcRuntimeState & { target: THREE.Vector3; lastCommand: string; actionUntil: number } = {
      agentId: "jaz", behavior: "hold", action: "idle", moving: false, waypoint: "stage", position: [-2.1, 0, -7.4], speed: 1.15,
      target: new THREE.Vector3(-2.1, 0, -7.4), lastCommand: "", actionUntil: 0,
    };

    const productionCamera = new THREE.Group();
    const cameraBody = box(productionCamera, [.56, .36, .72], [0, 0, 0], 0x182b34, COLORS.cyan);
    const cameraLens = new THREE.Mesh(new THREE.CylinderGeometry(.13, .18, .28, 16), new THREE.MeshStandardMaterial({ color: 0x071218, emissive: COLORS.cyan, emissiveIntensity: .34 }));
    cameraLens.rotation.x = Math.PI / 2; cameraLens.position.z = -.46; productionCamera.add(cameraLens);
    productionCamera.position.set(4.8, 2.2, 1.5); scene.add(productionCamera);
    cameraBody.name = "ProductionCameraRig";

    const xrConsole = operatorPanel();
    scene.add(xrConsole.group);
    const placeConsole = () => {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      const position = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 1.8);
      xrConsole.group.position.copy(position);
      xrConsole.group.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
      xrConsole.group.position.y -= .2;
    };

    const remoteAvatars = new Map<string, THREE.Group>();
    const avatarMixers = new Map<string, THREE.AnimationMixer>();
    const avatarLoader = new GLTFLoader();
    const avatarAssets = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();
    const loadAvatarAsset = (url: string) => {
      let request = avatarAssets.get(url);
      if (!request) {
        request = avatarLoader.loadAsync(url).then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }));
        avatarAssets.set(url, request);
      }
      return request;
    };
    const installAvatarModel = async (id: string, avatar: THREE.Group, url: string) => {
      avatar.userData.requestedAvatar = url;
      try {
        const asset = await loadAvatarAsset(url);
        if (remoteAvatars.get(id) !== avatar || avatar.userData.requestedAvatar !== url) return;
        const previous = avatar.getObjectByName("MemberAvatarModel");
        if (previous) avatar.remove(previous);
        avatarMixers.get(id)?.stopAllAction(); avatarMixers.delete(id);
        const model = cloneSkeleton(asset.scene) as THREE.Group;
        model.name = "MemberAvatarModel"; model.rotation.y = Math.PI;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        model.scale.setScalar(size.y > 0 ? 1.72 / size.y : 1);
        const scaledBounds = new THREE.Box3().setFromObject(model);
        model.position.y = -scaledBounds.min.y;
        model.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.frustumCulled = true; } });
        avatar.add(model);
        if (asset.animations.length) {
          const mixer = new THREE.AnimationMixer(model); mixer.clipAction(asset.animations[0]).play(); avatarMixers.set(id, mixer);
        }
        const fallback = avatar.getObjectByName("MemberAvatarFallback"); if (fallback) fallback.visible = false;
        avatar.userData.loadedAvatar = url;
      } catch {
        avatar.userData.requestedAvatar = "";
        const fallback = avatar.getObjectByName("MemberAvatarFallback"); if (fallback) fallback.visible = true;
      }
    };
    const syncAvatars = () => {
      const activeIds = new Set(participantsRef.current.map((participant) => participant.id));
      remoteAvatars.forEach((avatar, id) => { if (!activeIds.has(id)) { avatarMixers.get(id)?.stopAllAction(); avatarMixers.delete(id); scene.remove(avatar); remoteAvatars.delete(id); } });
      const detailedIds = new Set([...participantsRef.current].sort((a, b) => Math.hypot(a.position[0] - player.position.x, a.position[2] - player.position.z) - Math.hypot(b.position[0] - player.position.x, b.position[2] - player.position.z)).slice(0, 12).map((participant) => participant.id));
      participantsRef.current.forEach((participant) => {
        let avatar = remoteAvatars.get(participant.id);
        if (!avatar) {
          avatar = new THREE.Group();
          const color = new THREE.Color(participant.color);
          const fallback = new THREE.Group(); fallback.name = "MemberAvatarFallback";
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .75, 5, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .24, roughness: .55 }));
          body.position.y = 1.1;
          const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd7a27e, roughness: .82 }));
          head.position.y = 1.78;
          fallback.add(body, head); avatar.add(fallback, avatarLabel(participant.name, participant.color));
          avatar.position.set(...participant.position);
          remoteAvatars.set(participant.id, avatar); scene.add(avatar);
        }
        avatar.position.lerp(new THREE.Vector3(...participant.position), reducedMotion ? 1 : .3);
        const yawDelta = Math.atan2(Math.sin(participant.yaw - avatar.rotation.y), Math.cos(participant.yaw - avatar.rotation.y));
        avatar.rotation.y += yawDelta * (reducedMotion ? 1 : .3);
        const fallback = avatar.getObjectByName("MemberAvatarFallback");
        const model = avatar.getObjectByName("MemberAvatarModel");
        const showDetailed = detailedIds.has(participant.id) && Boolean(participant.avatarUrl);
        if (fallback) fallback.visible = !showDetailed || !model;
        if (model) model.visible = showDetailed && avatar.userData.loadedAvatar === participant.avatarUrl;
        if (showDetailed && participant.avatarUrl && avatar.userData.requestedAvatar !== participant.avatarUrl) void installAvatarModel(participant.id, avatar, participant.avatarUrl);
      });
    };

    const floorRaycaster = new THREE.Raycaster();
    const controllerMatrix = new THREE.Matrix4();
    const controllerRay = (controller: THREE.Object3D) => {
      controllerMatrix.identity().extractRotation(controller.matrixWorld);
      floorRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      floorRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(controllerMatrix);
    };
    const pulse = (controller: THREE.Object3D) => {
      const gamepad = (controller.userData.inputSource as XRInputSource | undefined)?.gamepad;
      const actuator = gamepad?.hapticActuators?.[0];
      if (actuator) void actuator.pulse(.55, 42);
    };
    const select = (event: THREE.Event & { target: THREE.Object3D }) => {
      const controller = event.target;
      controllerRay(controller);
      if (operatorRef.current && xrConsole.group.visible) {
        const button = floorRaycaster.intersectObjects(xrConsole.buttons, false)[0];
        const command = button?.object.userData.operatorCommand as StageVenueOperatorCommand | undefined;
        if (command) { onOperatorCommandRef.current?.(command); pulse(controller); return; }
      }
      const hit = floorRaycaster.intersectObject(floor, false)[0];
      if (!hit) return;
      if (isSafeVenuePoint(hit.point, colliders)) { player.position.x = hit.point.x; player.position.z = hit.point.z; pulse(controller); }
    };
    const toggleConsole = () => {
      if (!operatorRef.current) return;
      xrConsole.group.visible = !xrConsole.group.visible;
      if (xrConsole.group.visible) placeConsole();
      mount.dataset.operatorConsole = xrConsole.group.visible ? "visible" : "hidden";
    };
    const controllers = [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      controller.visible = false;
      const beamMaterial = new THREE.LineBasicMaterial({ color: index ? COLORS.magenta : COLORS.cyan, transparent: true, opacity: .95, depthTest: false });
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -.055), new THREE.Vector3(0, 0, -6)]), beamMaterial);
      ray.name = `ControllerLaser_${index}`; ray.renderOrder = 20;
      const shell = new THREE.Group(); shell.name = `TrackedController_${index}`;
      const shellColor = index ? COLORS.magenta : COLORS.cyan;
      const body = new THREE.Mesh(new THREE.BoxGeometry(.12, .09, .22), new THREE.MeshStandardMaterial({ color: 0x142a34, emissive: shellColor, emissiveIntensity: .28, metalness: .42, roughness: .42 }));
      body.position.set(0, -.035, .065); body.rotation.x = -.12;
      const nose = new THREE.Mesh(new THREE.SphereGeometry(.065, 14, 10), new THREE.MeshStandardMaterial({ color: shellColor, emissive: shellColor, emissiveIntensity: .55, roughness: .34 }));
      nose.scale.set(1, .68, .72); nose.position.set(0, -.015, -.02);
      const handIndicator = new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 8, 20), new THREE.MeshBasicMaterial({ color: shellColor, depthTest: false }));
      handIndicator.position.z = -.015; handIndicator.visible = false;
      shell.add(body, nose, handIndicator); controller.add(shell, ray);
      controller.addEventListener("connected", (event) => {
        const source = (event as THREE.Event & { data: XRInputSource }).data;
        controller.userData.inputSource = source; controller.visible = true;
        body.visible = !source.hand; nose.visible = !source.hand; handIndicator.visible = Boolean(source.hand);
      });
      controller.addEventListener("disconnected", () => { controller.visible = false; controller.userData.inputSource = null; });
      controller.addEventListener("selectstart", select); controller.addEventListener("squeezestart", toggleConsole); scene.add(controller); return controller;
    });

    const move = (forward: number, right: number) => {
      const direction = new THREE.Vector3(right, 0, -forward).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
      const desired = player.position.clone().addScaledVector(direction, .55);
      const resolved = resolveVenueMovement(player.position, desired, colliders);
      player.position.set(resolved.x, 0, resolved.z);
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
      return `${mode.toUpperCase()} active. Left stick moves, right stick snap-turns, trigger selects or teleports${operatorRef.current ? ", and grip opens production controls" : ""}.`;
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
      const command = npcCommandRef.current;
      if (command && command.id !== npcState.lastCommand) {
        npcState.lastCommand = command.id;
        npcState.agentId = command.agentId;
        if (command.kind === "move") {
          const targets = { entry: [0, 0, 9], stage: [-2.1, 0, -7.4], media: [-5.5, 0, -8], rack: [8.5, 0, -1], briefing: [0, 0, 3] } as const;
          const target = command.position || (command.waypoint ? targets[command.waypoint] : targets.stage);
          npcState.target.set(target[0], target[1], target[2]); npcState.waypoint = command.waypoint || "custom"; npcState.behavior = "hold";
        } else if (command.kind === "action" && command.action) {
          npcState.action = command.action; npcState.actionUntil = clock.elapsedTime + (command.action === "talk" ? 5 : 3);
        } else if (command.kind === "behavior" && command.behavior) npcState.behavior = command.behavior;
        else if (command.kind === "stop") { npcState.behavior = "hold"; npcState.target.copy(npcRoot.position); }
        else if (command.kind === "speed" && command.speed) npcState.speed = command.speed;
      }
      if (npcState.behavior === "patrol" && npcRoot.position.distanceTo(npcState.target) < .08) {
        const patrolTarget = npcState.target.z < 0 ? new THREE.Vector3(5.5, 0, 5) : new THREE.Vector3(-5.5, 0, -7.2);
        npcState.target.copy(patrolTarget);
      }
      const npcDelta = npcState.target.clone().sub(npcRoot.position); npcDelta.y = 0;
      npcState.moving = npcDelta.lengthSq() > .008;
      if (npcState.moving) {
        const step = Math.min(npcDelta.length(), npcState.speed * delta);
        npcRoot.position.addScaledVector(npcDelta.normalize(), step);
        npcRoot.rotation.y = Math.atan2(npcDelta.x, npcDelta.z);
        npcState.action = "walk";
      } else if (npcState.action === "walk" || (npcState.actionUntil && clock.elapsedTime >= npcState.actionUntil)) npcState.action = "idle";
      if (!reducedMotion) {
        npcBody.rotation.z = npcState.action === "wave" ? Math.sin(clock.elapsedTime * 7) * .14 : 0;
        npcHead.rotation.y = npcState.action === "talk" ? Math.sin(clock.elapsedTime * 5) * .16 : 0;
        npcRoot.position.y = npcState.moving ? Math.abs(Math.sin(clock.elapsedTime * 8)) * .035 : 0;
      }
      npcState.position = [npcRoot.position.x, 0, npcRoot.position.z];

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
      avatarMixers.forEach((mixer) => mixer.update(delta));
      const followedParticipant = followTargetRef.current === "crew" ? participantsRef.current[1] || participantsRef.current[0] : participantsRef.current[0];
      const followPosition = followTargetRef.current === "agent" || !followedParticipant
        ? npcRoot.position.clone().add(new THREE.Vector3(0, 1.45, 0))
        : new THREE.Vector3(...followedParticipant.position).add(new THREE.Vector3(0, 1.45, 0));
      const cameraOffsets: Record<StageProductionState["shot"], THREE.Vector3> = {
        wide: new THREE.Vector3(6.5, 3.2, 7.5), host: new THREE.Vector3(2.6, 1.9, 3.8), audience: new THREE.Vector3(-8, 3.8, 7), crane: new THREE.Vector3(7.5, 7.5, 10),
      };
      const cameraTarget = followTargetRef.current === "off" ? new THREE.Vector3(0, 1.8, -7) : followPosition;
      const desiredCameraPosition = cameraTarget.clone().add(cameraOffsets[current.shot]);
      if (current.cameraMotion.id === "crane-reveal") desiredCameraPosition.y += 1.8 + Math.sin(clock.elapsedTime * current.cameraMotion.speed) * 1.2;
      if (current.cameraMotion.id === "dolly-push") desiredCameraPosition.lerp(cameraTarget, .28 + Math.sin(clock.elapsedTime * current.cameraMotion.speed) * .08);
      productionCamera.position.lerp(desiredCameraPosition, reducedMotion ? 1 : Math.min(1, delta * 2.4));
      productionCamera.lookAt(cameraTarget);
      if (xrConsole.group.visible) {
        controllers.forEach((controller) => {
          controllerRay(controller);
          const hovered = floorRaycaster.intersectObjects(xrConsole.buttons, false)[0]?.object;
          xrConsole.buttons.forEach((button) => { button.scale.setScalar(button === hovered ? 1.06 : 1); });
        });
      }
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
      controllers.forEach((controller) => { controller.removeEventListener("selectstart", select); controller.removeEventListener("squeezestart", toggleConsole); });
      scene.traverse((object) => { if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite)) return; const geometry = "geometry" in object ? object.geometry as THREE.BufferGeometry : null; geometry?.dispose(); const source = "material" in object ? object.material as THREE.Material | THREE.Material[] : []; (Array.isArray(source) ? source : [source]).forEach((entry) => entry?.dispose()); });
      programTexture.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [layout, reducedMotion]);

  return <div className="stage-venue-world" ref={mountRef} aria-label={`${layout} multiplayer WebXR venue`}/>;
}

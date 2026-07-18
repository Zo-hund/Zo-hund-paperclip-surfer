import {
  ACESFilmicToneMapping,
  AmbientLight,
  AssetManager,
  AssetType,
  BoxGeometry,
  Color,
  DirectionalLight,
  DistanceGrabbable,
  EnvironmentType,
  FogExp2,
  Grabbed,
  Group,
  HemisphereLight,
  InputComponent,
  LocomotionSystem,
  LocomotionEnvironment,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PointLight,
  Pressed,
  RayInteractable,
  ReferenceSpaceType,
  RepeatWrapping,
  SessionMode,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TurningMethod,
  Types,
  World,
  buildSessionInit,
  createComponent,
  createSystem,
  type AssetManifest,
} from "@iwsdk/core";

export type IwsdkRuntimeEvent =
  | { kind: "interaction"; label: string; action: "selected" | "grabbed" }
  | { kind: "controllers"; left: boolean; right: boolean; leftTrigger: boolean; rightTrigger: boolean }
  | { kind: "session"; state: "live" | "ended" };

interface RuntimeOptions {
  turning: "snap" | "smooth";
  movementSpeed: number;
  turnSpeed: number;
  snapAngle: number;
  vignetteStrength: number;
  onEvent: (event: IwsdkRuntimeEvent) => void;
}

export interface AmxIwsdkRuntime {
  world: World;
  enterXR: () => Promise<void>;
  dispose: () => Promise<void>;
}

const DigitalTwinNode = createComponent("AMXDigitalTwinNode", {
  nodeId: { type: Types.String, default: "rack-unknown" },
  temperatureC: { type: Types.Float32, default: 24 },
  loadPercent: { type: Types.Float32, default: 42 },
  coolingPercent: { type: Types.Float32, default: 58 },
  healthPercent: { type: Types.Float32, default: 99 },
  updatedAt: { type: Types.Float64, default: 0 },
});

const SkillProp = createComponent("AMXSkillProp", {
  skillId: { type: Types.String, default: "unknown" },
  label: { type: Types.String, default: "Training tool" },
  activationCount: { type: Types.Int32, default: 0 },
});

const ControllerDiagnostics = createComponent("AMXControllerDiagnostics", {
  leftConnected: { type: Types.Boolean, default: false },
  rightConnected: { type: Types.Boolean, default: false },
  leftTrigger: { type: Types.Boolean, default: false },
  rightTrigger: { type: Types.Boolean, default: false },
});

class DigitalTwinSimulationSystem extends createSystem(
  { nodes: { required: [DigitalTwinNode] } },
  { sampleRate: { type: Types.Float32, default: 2 } },
) {
  private elapsed = 0;
  private frames = 0;

  update(delta: number, time: number) {
    this.frames += 1;
    const host = this.globals.amxHost as HTMLDivElement | undefined;
    if (host && this.frames % 30 === 0) {
      this.camera.updateWorldMatrix(true, false);
      const cameraMatrix = this.camera.matrixWorld.elements;
      host.dataset.frames = String(this.frames);
      host.dataset.drawCalls = String(this.renderer.info.render.calls);
      host.dataset.cameraWorld = [cameraMatrix[12], cameraMatrix[13], cameraMatrix[14]].map((value) => value.toFixed(2)).join(",");
      host.dataset.playerPosition = this.player.position.toArray().map((value) => value.toFixed(2)).join(",");
      host.dataset.playerQuaternion = this.player.quaternion.toArray().map((value) => value.toFixed(3)).join(",");
    }

    this.elapsed += delta;
    if (this.elapsed < 1 / this.config.sampleRate.peek()) return;
    this.elapsed = 0;
    let index = 0;
    for (const entity of this.queries.nodes.entities) {
      const phase = time * 0.35 + index * 0.8;
      entity.setValue(DigitalTwinNode, "temperatureC", 23.5 + Math.sin(phase) * 2.2);
      entity.setValue(DigitalTwinNode, "loadPercent", 48 + Math.sin(phase * 1.7) * 18);
      entity.setValue(DigitalTwinNode, "coolingPercent", 61 + Math.cos(phase * 1.2) * 12);
      entity.setValue(DigitalTwinNode, "healthPercent", 98.6 + Math.sin(phase * 0.45) * 0.8);
      entity.setValue(DigitalTwinNode, "updatedAt", time);
      index += 1;
    }
  }
}

class AmxInteractionSystem extends createSystem({
  selected: { required: [SkillProp, Pressed] },
  grabbed: { required: [SkillProp, Grabbed] },
  diagnostics: { required: [ControllerDiagnostics] },
}) {
  private leftConnected = false;
  private rightConnected = false;
  private leftTrigger = false;
  private rightTrigger = false;

  init() {
    const emitInteraction = (action: "selected" | "grabbed") => (entity: (typeof this.queries.selected.entities extends Set<infer E> ? E : never)) => {
      const label = entity.getValue(SkillProp, "label") || "Training tool";
      const count = entity.getValue(SkillProp, "activationCount") || 0;
      entity.setValue(SkillProp, "activationCount", count + 1);
      (this.globals.amxDispatch as RuntimeOptions["onEvent"] | undefined)?.({ kind: "interaction", label, action });
    };
    this.cleanupFuncs.push(
      this.queries.selected.subscribe("qualify", emitInteraction("selected")),
      this.queries.grabbed.subscribe("qualify", emitInteraction("grabbed")),
    );
  }

  update() {
    const left = this.input.xr.gamepads.left;
    const right = this.input.xr.gamepads.right;
    const nextLeftConnected = Boolean(left);
    const nextRightConnected = Boolean(right);
    const nextLeftTrigger = left?.getButtonPressed(InputComponent.Trigger) || false;
    const nextRightTrigger = right?.getButtonPressed(InputComponent.Trigger) || false;
    const changed = nextLeftConnected !== this.leftConnected
      || nextRightConnected !== this.rightConnected
      || nextLeftTrigger !== this.leftTrigger
      || nextRightTrigger !== this.rightTrigger;
    if (!changed) return;

    this.leftConnected = nextLeftConnected;
    this.rightConnected = nextRightConnected;
    this.leftTrigger = nextLeftTrigger;
    this.rightTrigger = nextRightTrigger;
    for (const entity of this.queries.diagnostics.entities) {
      entity.setValue(ControllerDiagnostics, "leftConnected", nextLeftConnected);
      entity.setValue(ControllerDiagnostics, "rightConnected", nextRightConnected);
      entity.setValue(ControllerDiagnostics, "leftTrigger", nextLeftTrigger);
      entity.setValue(ControllerDiagnostics, "rightTrigger", nextRightTrigger);
    }
    (this.globals.amxDispatch as RuntimeOptions["onEvent"] | undefined)?.({
      kind: "controllers",
      left: nextLeftConnected,
      right: nextRightConnected,
      leftTrigger: nextLeftTrigger,
      rightTrigger: nextRightTrigger,
    });
  }
}

const assets: AssetManifest = {
  dataCenter: { url: "/models/amx-digital-twin.glb", type: AssetType.GLTF, priority: "critical" },
  metalBase: { url: "/textures/generated/metal-basecolor.png", type: AssetType.Texture, priority: "critical" },
  metalNormal: { url: "/textures/generated/metal-normal.png", type: AssetType.Texture, priority: "critical" },
  metalRoughness: { url: "/textures/generated/metal-roughness.png", type: AssetType.Texture, priority: "critical" },
  concreteBase: { url: "/textures/generated/concrete-basecolor.png", type: AssetType.Texture, priority: "critical" },
  concreteNormal: { url: "/textures/generated/concrete-normal.png", type: AssetType.Texture, priority: "critical" },
  concreteRoughness: { url: "/textures/generated/concrete-roughness.png", type: AssetType.Texture, priority: "critical" },
};

function tuneDataCenterMaterials(root: Group) {
  const metalBase = AssetManager.getTexture("metalBase")!;
  const metalNormal = AssetManager.getTexture("metalNormal")!;
  const metalRoughness = AssetManager.getTexture("metalRoughness")!;
  const concreteBase = AssetManager.getTexture("concreteBase")!;
  const concreteNormal = AssetManager.getTexture("concreteNormal")!;
  const concreteRoughness = AssetManager.getTexture("concreteRoughness")!;
  for (const texture of [metalBase, metalNormal, metalRoughness, concreteBase, concreteNormal, concreteRoughness]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(2.5, 2.5);
  }
  metalBase.colorSpace = SRGBColorSpace;
  concreteBase.colorSpace = SRGBColorSpace;

  const tuned = new Set<MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || tuned.has(material)) continue;
      tuned.add(material);
      material.envMapIntensity = 1.45;
      if (material.name === "AMX_ConcreteFloor") {
        material.map = concreteBase;
        material.normalMap = concreteNormal;
        material.roughnessMap = concreteRoughness;
        material.normalScale.set(0.45, 0.45);
      } else if (material.name === "AMX_DarkMetal" || material.name === "AMX_Panel") {
        material.map = metalBase;
        material.normalMap = metalNormal;
        material.roughnessMap = metalRoughness;
        material.normalScale.set(0.55, 0.55);
        material.color.multiplyScalar(material.name === "AMX_DarkMetal" ? 1.65 : 1.35);
      }
      if (material.emissive.getHex() !== 0) {
        material.emissiveIntensity = Math.min(2.8, Math.max(1.25, material.emissiveIntensity));
      }
      material.needsUpdate = true;
    }
  });
}

function addLightRig(world: World) {
  const ambient = new AmbientLight(0xdff8ff, 2.1);
  ambient.name = "AMX_Ambient_Fill";
  const sky = new HemisphereLight(0xe8fbff, 0x183544, 3.8);
  sky.name = "AMX_Hemisphere_Key";
  const key = new DirectionalLight(0xffffff, 5);
  key.name = "AMX_Overhead_Key";
  key.position.set(2, 5.5, 4);
  world.createTransformEntity(ambient);
  world.createTransformEntity(sky);
  world.createTransformEntity(key);
  for (const [index, position] of [[-3, 3.2, 1.8], [3, 3.2, 1.8], [-3, 3.2, -2.2], [3, 3.2, -2.2]] .entries()) {
    const light = new PointLight(index % 2 ? 0xff8ae8 : 0x92efff, 8, 9, 1.65);
    light.name = `AMX_Aisle_Light_${index + 1}`;
    light.position.set(position[0], position[1], position[2]);
    world.createTransformEntity(light);
  }
}

function createTrainingProp(world: World, skillId: string, label: string, color: number, x: number) {
  const group = new Group();
  group.name = `Skill_${skillId}`;
  group.position.set(x, 1.05, 1.45);
  const shell = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.35, metalness: 0.56, roughness: 0.24 });
  const dark = new MeshStandardMaterial({ color: 0x142832, metalness: 0.68, roughness: 0.28 });
  const body = new Mesh(new BoxGeometry(0.38, 0.18, 0.62), dark);
  const sensor = new Mesh(new SphereGeometry(0.16, 24, 16), shell);
  sensor.scale.set(1.45, 0.7, 0.7);
  const ring = new Mesh(new TorusGeometry(0.24, 0.025, 10, 40), shell);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  group.add(body, sensor, ring);
  world.createTransformEntity(group)
    .addComponent(RayInteractable)
    .addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveTowardsTarget,
      returnToOrigin: true,
      scale: false,
      targetPositionOffset: [0, 0, -0.35],
    })
    .addComponent(PhysicsBody, {
      state: PhysicsState.Dynamic,
      linearDamping: 0.8,
      angularDamping: 0.8,
      gravityFactor: 0,
    })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: [0.55, 0.45, 0.72], density: 1.4, friction: 0.65 })
    .addComponent(SkillProp, { skillId, label });
}

function createDigitalTwinEntities(world: World) {
  [-3, -1, 1, 3].forEach((x, index) => {
    const marker = new Group();
    marker.name = `Rack_${String(index + 1).padStart(2, "0")}_DigitalTwin`;
    marker.position.set(x, 1.35, -2.35);
    world.createTransformEntity(marker).addComponent(DigitalTwinNode, {
      nodeId: `rack-${String(index + 1).padStart(2, "0")}`,
      temperatureC: 23.5 + index * 0.6,
      loadPercent: 42 + index * 7,
      coolingPercent: 62,
      healthPercent: 99.2,
    });
  });
  const diagnostics = new Group();
  diagnostics.name = "AMX_Controller_Diagnostics";
  world.createTransformEntity(diagnostics, { persistent: true }).addComponent(ControllerDiagnostics);
}

export async function createAmxIwsdkRuntime(host: HTMLDivElement, options: RuntimeOptions): Promise<AmxIwsdkRuntime> {
  host.replaceChildren();
  const world = await World.create(host, {
    assets,
    xr: {
      sessionMode: SessionMode.ImmersiveVR,
      referenceSpace: ReferenceSpaceType.LocalFloor,
      offer: "none",
      features: { handTracking: true, layers: true },
    },
    render: {
      fov: 66,
      near: 0.04,
      far: 160,
      defaultLighting: false,
      camera: { position: [0, 1.65, 0], lookAt: [0, 1.35, -3] },
    },
    input: { canvasPointerEvents: true },
    features: {
      locomotion: {
        useWorker: false,
        initialPlayerPosition: [2.75, 0.08, 2.9],
        comfortAssistLevel: options.vignetteStrength / 100,
        turningMethod: options.turning === "snap" ? TurningMethod.SnapTurn : TurningMethod.SmoothTurn,
        enableJumping: false,
        browserControls: { keyboard: true, gamepad: true },
      },
      grabbing: { useHandPinchForGrab: true },
      physics: true,
      spatialUI: false,
    },
  });

  world.globals.amxHost = host;
  world.globals.amxDispatch = options.onEvent;
  world.registerComponent(DigitalTwinNode)
    .registerComponent(SkillProp)
    .registerComponent(ControllerDiagnostics)
    .registerSystem(DigitalTwinSimulationSystem)
    .registerSystem(AmxInteractionSystem);

  world.player.position.set(2.75, 0.08, 2.9);
  world.player.updateWorldMatrix(true, true);
  world.renderer.domElement.className = "immersive-canvas iwsdk-canvas";
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  world.renderer.toneMapping = ACESFilmicToneMapping;
  world.renderer.toneMappingExposure = 1.42;
  world.scene.background = new Color(0x07131a);
  world.scene.fog = new FogExp2(0x07131a, 0.006);
  host.dataset.xrRuntime = "iwsdk-0.4.2";
  host.dataset.renderer = "webgl2-webxr";

  const dataCenter = AssetManager.getGLTF("dataCenter")?.scene as Group | undefined;
  if (!dataCenter) throw new Error("The Blender data-center world could not be loaded.");
  dataCenter.name = "AMX_Mini_Data_Center_Pod";
  tuneDataCenterMaterials(dataCenter);
  world.createTransformEntity(dataCenter)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC })
    .addComponent(PhysicsBody, { state: PhysicsState.Static })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.TriMesh, friction: 0.84 });

  addLightRig(world);
  createTrainingProp(world, "cooling-override", "Cooling override tool", 0x55e6ff, -2.45);
  createTrainingProp(world, "thermal-scanner", "Thermal scanner", 0xff63de, 0);
  createTrainingProp(world, "network-probe", "Network probe", 0xf4c96b, 2.45);
  createDigitalTwinEntities(world);

  const locomotion = world.getSystem(LocomotionSystem);
  if (locomotion) {
    host.dataset.locomotionInitial = locomotion.config.initialPlayerPosition.peek().join(",");
    locomotion.config.slidingSpeed.value = 1.2 + (options.movementSpeed / 100) * 3.8;
    locomotion.config.turningSpeed.value = 40 + (options.turnSpeed / 100) * 140;
    locomotion.config.turningAngle.value = options.snapAngle;
  }

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    world.camera.aspect = width / height;
    world.camera.updateProjectionMatrix();
    world.renderer.setSize(width, height, false);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.dataset.worldReady = "true";

  const enterXR = async () => {
    if (!navigator.xr) throw new Error("WebXR is unavailable in this browser.");
    const supported = await navigator.xr.isSessionSupported(SessionMode.ImmersiveVR);
    if (!supported) throw new Error("Immersive VR is unavailable on this device.");
    const session = await navigator.xr.requestSession(SessionMode.ImmersiveVR, buildSessionInit({
      sessionMode: SessionMode.ImmersiveVR,
      referenceSpace: ReferenceSpaceType.LocalFloor,
      features: { handTracking: true, layers: true },
    }));
    world.renderer.xr.setReferenceSpaceType(ReferenceSpaceType.LocalFloor);
    await world.renderer.xr.setSession(session);
    world.session = session;
    options.onEvent({ kind: "session", state: "live" });
    session.addEventListener("end", () => {
      world.session = undefined;
      options.onEvent({ kind: "session", state: "ended" });
    }, { once: true });
  };

  const dispose = async () => {
    observer.disconnect();
    if (world.session) await world.session.end().catch(() => undefined);
    world.renderer.setAnimationLoop(null);
    [...world.getSystems()].reverse().forEach((system) => system.destroy());
    world.input.destroy();
    world.renderer.dispose();
    world.renderer.domElement.remove();
  };

  return { world, enterXR, dispose };
}

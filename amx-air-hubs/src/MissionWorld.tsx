import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Award, BadgeCheck, BookOpen, Bot, Box, Check, Clock3, Cpu, Gamepad2, Gauge, HelpCircle, LoaderCircle, LockKeyhole, Play, RotateCcw, Send, ShieldCheck, Sparkles, Trophy, Users, Wrench, X, Zap } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useAMX } from "./AppContext";
import { sendAgentRequest, type RuntimeTransport } from "./agent-runtime";
import { agents } from "./data";
import { useMemberAuth } from "./member-auth";
import { awardBadge, trackEvent } from "./platform";
import {
  EMPTY_MISSION_WORLD_PROGRESS, MISSION_WORLD_BADGES, MISSION_WORLDS, missionWorldLevel,
  missionWorldRank, readMissionWorldProgress, type MissionWorldDefinition, type MissionWorldId, type MissionWorldMode,
  type MissionWorldProgress,
} from "./mission-world-data";
import { applyMissionReward } from "./mission-world/gamification";
import { MISSION_WORLD_FEATURES } from "./mission-world/features";
import { allLessonsComplete, createMissionRuntime, formatMissionTime, objectiveProgress } from "./mission-world/mission-engine";
import { LEADERBOARD_SCOPES, multiplayerStatus, SESSION_MODES } from "./mission-world/multiplayer";
import { issueMissionWorldProof } from "./mission-world/opprrc";
import { approveSimulation, completeLesson, recordAttempt, recordSimulationRun, saveMissionWorldProgress } from "./mission-world/progress-store";
import { EMPTY_SIMULATION_CONFIGURATION, runMissionSimulation, SIMULATOR_SCENARIOS, type SimulationConfiguration } from "./mission-world/simulator";
import type { LeaderboardScope, MissionRuntimeState, XRCapabilities } from "./mission-world/types";
import { detectXRCapabilities } from "./mission-world/xr-capabilities";
import { pathfinderCollectibles, pathfinderGroup } from "./mission-world/pathfinder";
import "./mission-world.css";
import "./mission-world-entry.css";

type ExperienceMode = "web" | "ar" | "vr" | "mr";
type XRLauncher = (mode: ExperienceMode) => Promise<string>;
const MISSION_WORLD_TOUR_KEY = "amxMissionWorldTourV1";
const TOUR_STEPS = [
  { title: "Choose a mission world", label: "EXPLORE", body: "Use the five portal buttons to move between AI, XR, Robotics, Automations, and World Builder. Your progress is saved in this browser." },
  { title: "Learn to know", label: "KNOW", body: "Open each checkpoint, practice the DO task, and complete all six to unlock that world's client capstone." },
  { title: "Build a real solution", label: "DO", body: "Take a professional role, equip tools and safeguards, write a plan, then test it against a changing client scenario." },
  { title: "Review before deployment", label: "BE", body: "Read the score and consequences. Passing work still needs a human Pit Stop approval before proof can be issued." },
  { title: "Enter your preferred mode", label: "WEB / AR / VR / MR", body: "Use Web on any device or launch an immersive mode when supported. In Quest, controller triggers select portals and place builder objects." },
  { title: "Ask your mission guide", label: "AGENT CONTEXT", body: "Your assigned AMX agent reads only the active mission state you send and recommends the next useful action. Guidance never grants approval for you." },
] as const;

function MissionWorldTour({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const item = TOUR_STEPS[step];
  useEffect(() => {
    actionRef.current?.focus();
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose, step]);
  return <div className="mission-world-tour-backdrop" role="presentation">
    <section className="mission-world-tour" role="dialog" aria-modal="true" aria-labelledby="mission-world-tour-title">
      <header><span className="eyebrow">HOW MISSION WORLD WORKS</span><button onClick={onClose} aria-label="Close introduction" title="Close introduction"><X/></button></header>
      <div className="mission-world-tour-mark"><span>{step + 1}</span><small>{item.label}</small></div>
      <h2 id="mission-world-tour-title">{item.title}</h2><p>{item.body}</p>
      <div className="mission-world-tour-progress" aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}>{TOUR_STEPS.map((_, index) => <i key={index} className={index <= step ? "active" : ""}/>)}</div>
      <footer><button disabled={step === 0} onClick={() => onStep(step - 1)}><ArrowLeft/>Back</button><button ref={actionRef} className="primary" onClick={() => step === TOUR_STEPS.length - 1 ? onClose() : onStep(step + 1)}>{step === TOUR_STEPS.length - 1 ? "Enter Mission World" : "Next"}{step < TOUR_STEPS.length - 1 && <ArrowRight/>}</button></footer>
    </section>
  </div>;
}

function MissionWorldScene({ activeId, builderActive, reducedMotion, onPortal, onBuilt, onXRReady }: {
  activeId: MissionWorldId;
  builderActive: boolean;
  reducedMotion: boolean;
  onPortal: (id: MissionWorldId) => void;
  onBuilt: (count: number) => void;
  onXRReady: (launcher: XRLauncher | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeId);
  const builderRef = useRef(builderActive);
  const onPortalRef = useRef(onPortal);
  const onBuiltRef = useRef(onBuilt);
  const onXRReadyRef = useRef(onXRReady);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => { builderRef.current = builderActive; }, [builderActive]);
  useEffect(() => { onPortalRef.current = onPortal; }, [onPortal]);
  useEffect(() => { onBuiltRef.current = onBuilt; }, [onBuilt]);
  useEffect(() => { onXRReadyRef.current = onXRReady; }, [onXRReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const worldBackground = new THREE.Color(0x02070b);
    scene.background = worldBackground;
    scene.fog = new THREE.FogExp2(0x02070b, 0.022);
    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 180);
    camera.position.set(0, 13, 25);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "mission-world-canvas";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 12;
    controls.maxDistance = 38;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 2.2, 0);

    scene.add(new THREE.HemisphereLight(0xbcecff, 0x14051e, 2.8));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(8, 18, 10);
    key.castShadow = true;
    scene.add(key);
    const magenta = new THREE.PointLight(0xff4fd8, 45, 34, 2);
    magenta.position.set(-9, 8, -5);
    scene.add(magenta);

    const world = new THREE.Group();
    scene.add(world);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 14.4, 1.1, 64), new THREE.MeshStandardMaterial({ color: 0x0a1822, metalness: 0.72, roughness: 0.26 }));
    floor.position.y = -0.58;
    floor.receiveShadow = true;
    world.add(floor);
    const grid = new THREE.GridHelper(24, 24, 0x55e6ff, 0x203943);
    grid.position.y = 0.01;
    world.add(grid);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12.4, 0.11, 12, 96), new THREE.MeshBasicMaterial({ color: 0x55e6ff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    world.add(ring);

    const hub = new THREE.Group();
    const hubCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 2), new THREE.MeshStandardMaterial({ color: 0x101d2a, emissive: 0x0e8fa0, emissiveIntensity: 1.3, metalness: 0.85, roughness: 0.18 }));
    hubCore.position.y = 2.1;
    hub.add(hubCore);
    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.07, 10, 72), new THREE.MeshBasicMaterial({ color: 0xff75d8 }));
    hubRing.position.y = 2.1;
    hubRing.rotation.x = Math.PI / 2;
    hub.add(hubRing);
    world.add(hub);

    const portalMeshes: THREE.Mesh[] = [];
    MISSION_WORLDS.forEach((mission, index) => {
      const angle = (index / MISSION_WORLDS.length) * Math.PI * 2 - Math.PI / 2;
      const portal = new THREE.Group();
      portal.position.set(Math.cos(angle) * 8.8, 2.1, Math.sin(angle) * 8.8);
      portal.rotation.y = -angle + Math.PI / 2;
      const material = new THREE.MeshStandardMaterial({ color: mission.color, emissive: mission.color, emissiveIntensity: 1.6, metalness: 0.62, roughness: 0.18 });
      const frame = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.16, 16, 48), material);
      frame.userData.missionId = mission.id;
      frame.castShadow = true;
      portal.add(frame);
      const core = new THREE.Mesh(new THREE.CircleGeometry(1.32, 40), new THREE.MeshBasicMaterial({ color: mission.color, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
      core.position.z = -0.04;
      portal.add(core);
      world.add(portal);
      portalMeshes.push(frame);
    });

    const starsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(1200);
    for (let index = 0; index < positions.length; index += 1) positions[index] = (Math.random() - 0.5) * 100;
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xbbefff, size: 0.07 })));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const built: THREE.Mesh[] = [];
    const placeStructure = (point: THREE.Vector3) => {
      if (!builderRef.current) return;
      const geometries = [new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.62, 24, 16), new THREE.CylinderGeometry(0.58, 0.58, 1.2, 24)];
      const mesh = new THREE.Mesh(geometries[built.length % geometries.length], new THREE.MeshStandardMaterial({ color: [0x55e6ff, 0xff75d8, 0x5ee4a8][built.length % 3], metalness: 0.35, roughness: 0.28 }));
      mesh.position.set(Math.round(point.x), 0.62, Math.round(point.z));
      mesh.castShadow = true;
      world.add(mesh);
      built.push(mesh);
      onBuiltRef.current(built.length);
    };
    const pointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const portalHit = raycaster.intersectObjects(portalMeshes, false)[0];
      if (portalHit) {
        onPortalRef.current(portalHit.object.userData.missionId as MissionWorldId);
        return;
      }
      const floorHit = raycaster.intersectObject(floor, false)[0];
      if (!floorHit) return;
      placeStructure(floorHit.point);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);

    const controllerRaycaster = new THREE.Raycaster();
    const controllerMatrix = new THREE.Matrix4();
    const selectWithController = (event: THREE.Event & { target: THREE.Object3D }) => {
      const controller = event.target;
      controllerMatrix.identity().extractRotation(controller.matrixWorld);
      controllerRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      controllerRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(controllerMatrix);
      const portalHit = controllerRaycaster.intersectObjects(portalMeshes, false)[0];
      if (portalHit) {
        onPortalRef.current(portalHit.object.userData.missionId as MissionWorldId);
        return;
      }
      const floorHit = controllerRaycaster.intersectObject(floor, false)[0];
      if (floorHit) placeStructure(floorHit.point);
    };
    const controllers = [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]), new THREE.LineBasicMaterial({ color: 0x8ef5ff }));
      ray.name = "XR pointer";
      controller.add(ray);
      controller.addEventListener("select", selectWithController);
      scene.add(controller);
      return controller;
    });

    const launchXR: XRLauncher = async (mode) => {
      if (mode === "web") {
        await renderer.xr.getSession()?.end();
        return "Web 3D mode active. Drag to orbit and select portals directly.";
      }
      if (!MISSION_WORLD_FEATURES.webXR) return "Immersive mode is disabled for this release.";
      if (!window.isSecureContext) return "WebXR requires HTTPS or localhost.";
      if (!navigator.xr) return "This browser does not expose WebXR. Web 3D remains available.";
      const sessionMode: XRSessionMode = mode === "vr" ? "immersive-vr" : "immersive-ar";
      if (!await navigator.xr.isSessionSupported(sessionMode)) return `${mode.toUpperCase()} is not supported by this device and browser.`;
      await renderer.xr.getSession()?.end();
      const overlayRoot = mount.closest(".mission-world-page") as Element;
      const options = {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking", "hit-test", "anchors", "dom-overlay"],
        domOverlay: { root: overlayRoot },
      } as XRSessionInit;
      const session = await navigator.xr.requestSession(sessionMode, options);
      if (sessionMode === "immersive-ar") scene.background = null;
      session.addEventListener("end", () => { scene.background = worldBackground; });
      await renderer.xr.setSession(session);
      return `${mode.toUpperCase()} session active. Use either controller trigger to select portals and place builder objects.`;
    };
    onXRReadyRef.current(launchXR);

    const clock = new THREE.Clock();
    const render = () => {
      const time = clock.getElapsedTime();
      if (!reducedMotion) {
        ring.rotation.z = time * 0.08;
        hub.rotation.y = time * 0.22;
        built.forEach((object, index) => { object.rotation.y += 0.002 + index * 0.0004; });
      }
      portalMeshes.forEach((mesh, index) => {
        const selected = mesh.userData.missionId === activeRef.current;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = selected ? 3 : 1.25 + Math.sin(time * 1.8 + index) * 0.2;
        mesh.scale.setScalar(selected ? 1.12 : 1);
      });
      controls.update();
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(render);
    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    return () => {
      onXRReadyRef.current(null);
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      controllers.forEach((controller) => controller.removeEventListener("select", selectWithController));
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      starsGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reducedMotion]);

  return <div className="mission-world-scene" ref={mountRef} aria-label="Interactive Three.js mission world"/>;
}

export function MissionWorldPage() {
  const { role, settings, grantXP, refreshRewards, setLatestProof } = useAMX();
  const member = useMemberAuth();
  const [progress, setProgress] = useState<MissionWorldProgress>(readMissionWorldProgress);
  const [activeId, setActiveId] = useState<MissionWorldId>("ai");
  const [lessonIndex, setLessonIndex] = useState(0);
  const [runtime, setRuntime] = useState<MissionRuntimeState>(() => createMissionRuntime("ai"));
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>("individual");
  const [xrCapabilities, setXRCapabilities] = useState<XRCapabilities | null>(null);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("web");
  const [xrStatus, setXRStatus] = useState("Web 3D mode active.");
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfiguration>(() => readMissionWorldProgress().simulations.ai?.configuration || EMPTY_SIMULATION_CONFIGURATION);
  const [sequence, setSequence] = useState<string[]>([]);
  const [builtCount, setBuiltCount] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [feedback, setFeedback] = useState("Choose an answer to run the simulation.");
  const [toast, setToast] = useState("");
  const [tourOpen, setTourOpen] = useState(() => localStorage.getItem(MISSION_WORLD_TOUR_KEY) !== "complete");
  const [tourStep, setTourStep] = useState(0);
  const [agentGuidance, setAgentGuidance] = useState<{ text: string; transport: RuntimeTransport } | null>(null);
  const [agentWorking, setAgentWorking] = useState(false);
  const startedAt = useRef(Date.now());
  const xrLauncher = useRef<XRLauncher | null>(null);
  const activeWorld = MISSION_WORLDS.find((world) => world.id === activeId) || MISSION_WORLDS[0];
  const scenario = SIMULATOR_SCENARIOS[activeId];
  const simulationRecord = progress.simulations[activeId];
  const simulationResult = simulationRecord?.lastResult;
  const completed = progress.completed.includes(activeId);
  const level = missionWorldLevel(progress.xp);
  const rank = missionWorldRank(level);
  const lessonProgress = objectiveProgress(activeWorld, progress);
  const capstoneUnlocked = allLessonsComplete(activeWorld, progress);
  const activeLesson = activeWorld.lessons[Math.min(lessonIndex, activeWorld.lessons.length - 1)];
  const domainBuildReady = activeWorld.activity === "builder" ? builtCount >= 3 : activeWorld.activity === "sequence" ? sequence.join("|") === activeWorld.sequence?.join("|") : true;
  const configurationMatchesRun = JSON.stringify(simulationRecord?.configuration) === JSON.stringify(simulationConfig);
  const canComplete = Boolean(simulationRecord?.approved && simulationResult?.deploymentEligible && configurationMatchesRun && domainBuildReady);
  const group = pathfinderGroup(progress);
  const missionAgent = agents.find((agent) => agent.id === activeWorld.agentId) || agents[0];
  const nextGuidance = completed
    ? `Open another portal or visit your Pathfinder Passport to review ${activeWorld.badge}.`
    : !capstoneUnlocked
      ? `Practice ${activeLesson.practice.toLowerCase()} Then complete checkpoint ${lessonIndex + 1} of ${activeWorld.lessons.length}.`
      : !simulationResult
        ? `Assign a ${scenario.roles[0]} role, equip a tool and safeguards, write a clear plan, then run the client simulation.`
        : !simulationResult.deploymentEligible
          ? `Your ${simulationResult.score} score is blocked. Resolve ${simulationResult.consequences[0] || "the highlighted consequence"} and run an improved configuration.`
          : !simulationRecord?.approved
            ? "The run is review-ready. Inspect the consequences, then ask a human trainer or operator to record Pit Stop approval."
            : "Approval is recorded. Complete the mission to issue tenant-scoped OPPRRC proof and unlock the collectible.";

  const selectWorld = useCallback((id: MissionWorldId) => {
    setActiveId(id);
    setLessonIndex(0);
    setRuntime(createMissionRuntime(id));
    setSimulationConfig(progress.simulations[id]?.configuration || EMPTY_SIMULATION_CONFIGURATION);
    setSequence([]);
    setAgentGuidance(null);
    setFeedback("Choose an answer to run the simulation.");
    startedAt.current = Date.now();
  }, [progress.simulations]);

  useEffect(() => {
    detectXRCapabilities().then(setXRCapabilities);
  }, []);

  const registerXRLauncher = useCallback((launcher: XRLauncher | null) => { xrLauncher.current = launcher; }, []);
  const closeTour = useCallback(() => { localStorage.setItem(MISSION_WORLD_TOUR_KEY, "complete"); setTourOpen(false); }, []);
  const replayTour = () => { setTourStep(0); setTourOpen(true); };
  const askMissionAgent = async () => {
    setAgentWorking(true);
    try {
      const response = await sendAgentRequest(missionAgent, `Guide the learner to the next safe, concrete action. Mission: ${activeWorld.title}. Client: ${scenario.client}. Active checkpoint: ${activeLesson.title}. Checkpoints complete: ${lessonProgress.complete}/${lessonProgress.total}. Session mode: ${progress.mode}. Display mode: ${experienceMode}. Simulation score: ${simulationResult?.score ?? "not run"}. Deployment eligible: ${Boolean(simulationResult?.deploymentEligible)}. Human approval: ${Boolean(simulationRecord?.approved)}. Current system recommendation: ${nextGuidance} Keep the response under 80 words and do not claim approval or completion.`, [], "text");
      setAgentGuidance({ text: response.text, transport: response.transport });
      trackEvent("mission_world_agent_guidance", { missionId: `mission-world-${activeId}`, role });
    } finally {
      setAgentWorking(false);
    }
  };
  const selectExperienceMode = async (mode: ExperienceMode) => {
    setExperienceMode(mode);
    try {
      setXRStatus(await xrLauncher.current?.(mode) || "The 3D scene is still loading.");
    } catch (error) {
      setExperienceMode("web");
      setXRStatus(error instanceof Error ? error.message : "The immersive session could not start. Web 3D remains available.");
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setRuntime((current) => ({ ...current, elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000) })), 1000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  const setMode = (mode: MissionWorldMode) => {
    const currentSimulation = progress.simulations[activeId];
    const next = { ...progress, mode, simulations: currentSimulation ? { ...progress.simulations, [activeId]: { ...currentSimulation, approved: false } } : progress.simulations };
    setProgress(next);
    saveMissionWorldProgress(next);
    if (currentSimulation) setFeedback("Session mode changed. Run the simulation again to recalculate teamwork and approval.");
    trackEvent("mission_world_mode_selected", { missionId: `mission-world-${activeId}`, role });
  };

  const markLessonComplete = () => {
    if (progress.lessons[activeId]?.includes(activeLesson.id)) {
      setLessonIndex((current) => Math.min(activeWorld.lessons.length - 1, current + 1));
      return;
    }
    const next = completeLesson(progress, activeId, activeLesson.id);
    setProgress(next);
    saveMissionWorldProgress(next);
    const nextIndex = Math.min(activeWorld.lessons.length - 1, lessonIndex + 1);
    setLessonIndex(nextIndex);
    setRuntime((current) => ({ ...current, status: next.lessons[activeId]?.length === activeWorld.lessons.length ? "active" : "briefing" }));
    setFeedback(next.lessons[activeId]?.length === activeWorld.lessons.length ? "All checkpoints complete. The capstone simulation is unlocked." : "Checkpoint secured. Continue the learning path.");
    trackEvent("mission_world_lesson_completed", { missionId: `mission-world-${activeId}`, role });
  };

  const failAttempt = (message: string) => {
    const next = recordAttempt(progress, activeId);
    setProgress(next);
    saveMissionWorldProgress(next);
    setRuntime((current) => ({ ...current, attempts: current.attempts + 1, status: "retry" }));
    setFeedback(message);
  };

  const toggleTool = (id: string) => setSimulationConfig((current) => ({ ...current, toolIds: current.toolIds.includes(id) ? current.toolIds.filter((item) => item !== id) : [...current.toolIds, id] }));
  const toggleSafeguard = (id: string) => setSimulationConfig((current) => ({ ...current, safeguardIds: current.safeguardIds.includes(id) ? current.safeguardIds.filter((item) => item !== id) : [...current.safeguardIds, id] }));

  const runSimulation = () => {
    const planWords = simulationConfig.plan.trim().split(/\s+/).filter(Boolean).length;
    if (!simulationConfig.role || planWords < 6 || simulationConfig.toolIds.length === 0) {
      failAttempt("Assign a professional role, equip at least one tool, and write a plan of six or more words before testing.");
      return;
    }
    if (!domainBuildReady) {
      failAttempt(activeWorld.activity === "builder" ? "Build at least three world structures before running the learner-flow simulation." : "Program the complete Sense, Plan, Act control loop before running the robot.");
      return;
    }
    const run = (simulationRecord?.runs || 0) + 1;
    const result = runMissionSimulation(scenario, simulationConfig, progress.mode, run);
    const next = recordSimulationRun(progress, activeId, simulationConfig, result);
    setProgress(next);
    saveMissionWorldProgress(next);
    setRuntime((current) => ({ ...current, attempts: result.run, status: result.deploymentEligible ? "ready" : "retry" }));
    setFeedback(result.deploymentEligible ? `Simulation scored ${result.score}. Review the evidence and request human approval.` : `Simulation scored ${result.score}. Deployment is blocked; improve the configuration and run again.`);
    trackEvent("mission_world_simulation_run", { missionId: `mission-world-${activeId}`, role });
  };

  const approveDeployment = () => {
    if (!simulationResult?.deploymentEligible) return;
    const next = approveSimulation(progress, activeId);
    setProgress(next);
    saveMissionWorldProgress(next);
    setFeedback("Pit Stop approval recorded. The solution can now be deployed and captured as OPPRRC evidence.");
    trackEvent("mission_world_deployment_approved", { missionId: `mission-world-${activeId}`, role });
  };

  const complete = () => {
    if (!capstoneUnlocked) {
      setFeedback(`Complete all ${activeWorld.lessons.length} learning checkpoints to unlock the capstone.`);
      return;
    }
    if (!canComplete) {
      setFeedback("Run an eligible solution, review its consequences, and record human Pit Stop approval before deployment.");
      return;
    }
    if (completed) {
      setFeedback("Simulation passed again. Your original reward and proof remain secured.");
      return;
    }
    const first = progress.completed.length === 0;
    const last = progress.completed.length === MISSION_WORLDS.length - 1;
    const awarded = applyMissionReward(progress, activeId);
    if (!awarded.reward) return;
    const { xp: rewardXP, coins: rewardCoins } = awarded.reward;
    const next = awarded.progress;
    saveMissionWorldProgress(next);
    setProgress(next);
    grantXP(rewardXP);
    if (first) awardBadge("First Launch");
    if (last) awardBadge("Mission Master");
    const canvas = document.querySelector<HTMLCanvasElement>(".mission-world-canvas");
    const simulation = next.simulations[activeId];
    if (!simulation) return;
    const evidenceProof = issueMissionWorldProof({ world: activeWorld, role, rewardXP, startedAt: startedAt.current, mode: progress.mode, completedLessons: next.lessons[activeId] || [], simulation, canvas });
    setLatestProof(evidenceProof);
    refreshRewards();
    trackEvent("mission_world_rewarded", { missionId: evidenceProof.missionId, role });
    setRuntime((current) => ({ ...current, status: "passed" }));
    setFeedback("Simulation passed. OPPRRC evidence and certificate are ready in your Proof Wallet.");
    const collectible = pathfinderCollectibles(next).find((item) => item.missionId === activeId);
    setToast(`+${rewardXP} XP / +${rewardCoins} AMX Coins / ${collectible?.name || activeWorld.badge}`);
    window.setTimeout(() => setToast(""), 3200);
  };

  const resetProgress = () => {
    setProgress(EMPTY_MISSION_WORLD_PROGRESS);
    saveMissionWorldProgress(EMPTY_MISSION_WORLD_PROGRESS);
    setSimulationConfig(EMPTY_SIMULATION_CONFIGURATION);
    setSequence([]);
    setBuiltCount(0);
    setLessonIndex(0);
    setRuntime(createMissionRuntime(activeId));
    setSceneRevision((value) => value + 1);
    setFeedback("Mission World progress reset. Global proof records remain intact.");
  };

  const nextLevelXP = 250 - (progress.xp % 250);
  const totalLessons = MISSION_WORLDS.reduce((total, world) => total + (progress.lessons[world.id]?.length || 0), 0);
  const selectedResources = [...scenario.tools.filter((entry) => simulationConfig.toolIds.includes(entry.id)), ...scenario.safeguards.filter((entry) => simulationConfig.safeguardIds.includes(entry.id))];
  const plannedSpend = selectedResources.reduce((total, entry) => total + entry.cost, 0);
  const plannedMinutes = selectedResources.reduce((total, entry) => total + entry.minutes, 0);
  return <div className="mission-world-page">
    <MissionWorldScene key={sceneRevision} activeId={activeId} builderActive={activeId === "builder" && capstoneUnlocked} reducedMotion={settings.reducedMotion} onPortal={selectWorld} onBuilt={setBuiltCount} onXRReady={registerXRLauncher}/>
    <header className="mission-world-hud mission-world-topbar">
      <div><Link className="mission-world-exit" to="/missions" aria-label="Exit Mission World" title="Exit Mission World"><X/></Link><button className="mission-world-help" onClick={replayTour} aria-label="How Mission World works" title="How Mission World works"><HelpCircle/></button><span className="eyebrow">AMX AIR HUBS / LEARN - BUILD - EARN</span><h1>Mission World</h1></div>
      <div className="mission-world-stats"><span><b>{level}</b><small>LEVEL</small></span><span><b>{progress.xp}</b><small>WORLD XP</small></span><span><b>{progress.coins}</b><small>AMX COINS</small></span><span><b>{totalLessons}/30</b><small>CHECKPOINTS</small></span><span><b>{progress.completed.length}/5</b><small>CAPSTONES</small></span></div>
    </header>

    <nav className="mission-world-hud mission-world-dock" aria-label="Mission World portals">
      {MISSION_WORLDS.map((world) => <button key={world.id} className={`${activeId === world.id ? "active" : ""} ${progress.completed.includes(world.id) ? "complete" : ""}`} style={{ "--world-color": world.color } as React.CSSProperties} onClick={() => selectWorld(world.id)}><i/>{progress.completed.includes(world.id) ? <Check/> : <Gamepad2/>}<span>{world.shortLabel}</span></button>)}
    </nav>

    <aside className="mission-world-hud mission-world-briefing" style={{ "--world-color": activeWorld.color } as React.CSSProperties}>
      <header><div><span className="eyebrow">{completed ? "MISSION COMPLETE" : capstoneUnlocked ? "CAPSTONE UNLOCKED" : "LEARNING ACTIVE"}</span><h2>{activeWorld.title}</h2></div><b><Clock3/> {formatMissionTime(runtime.elapsedSeconds)}</b></header>
      <p>{activeWorld.description}</p>
      <section className="mission-world-agent-guide"><header><span><Bot/><b>{missionAgent.name} / {missionAgent.role}</b></span><small>{agentGuidance?.transport || "context ready"}</small></header><p>{agentGuidance?.text || nextGuidance}</p><button disabled={agentWorking} onClick={() => void askMissionAgent()}>{agentWorking ? <LoaderCircle className="spin"/> : <Send/>}{agentWorking ? "Building guidance" : `Ask ${missionAgent.name}`}</button></section>
      <div className="mission-world-lesson-rail" aria-label={`${activeWorld.title} learning checkpoints`}>
        {activeWorld.lessons.map((lesson, index) => <button key={lesson.id} className={`${lessonIndex === index ? "active" : ""} ${progress.lessons[activeId]?.includes(lesson.id) ? "complete" : ""}`} onClick={() => setLessonIndex(index)} title={lesson.title}>{progress.lessons[activeId]?.includes(lesson.id) ? <Check/> : index + 1}</button>)}
      </div>
      <section className="mission-world-lesson"><BookOpen/><div><b>{activeLesson.title}</b><p>{activeLesson.brief}</p><small>DO: {activeLesson.practice}</small></div></section>
      <button className="mission-world-checkpoint" onClick={markLessonComplete}>{progress.lessons[activeId]?.includes(activeLesson.id) ? <Check/> : <Zap/>}{progress.lessons[activeId]?.includes(activeLesson.id) ? "Checkpoint complete / next" : "Complete checkpoint"}</button>
      <div className="mission-world-capstone"><span><b>CAPSTONE</b><small>{lessonProgress.complete}/{lessonProgress.total} checkpoints / difficulty {activeWorld.difficulty}</small></span><strong>{capstoneUnlocked ? `+${activeWorld.xp} XP` : "LOCKED"}</strong></div>
      <div className={`mission-world-capstone-body ${capstoneUnlocked ? "unlocked" : ""}`} aria-disabled={!capstoneUnlocked}>
        <div className="mission-world-client"><Bot/><span><b>{scenario.client}</b><small>{capstoneUnlocked ? scenario.need : "Finish the learning path to activate this client mission."}</small></span></div>
        <div className="mission-world-resources"><span><b>{plannedSpend}/{scenario.budget}</b><small>CREDITS</small></span><span><b>{plannedMinutes}/{scenario.timeLimit}</b><small>MINUTES</small></span><span><b>{simulationRecord?.runs || 0}</b><small>RUNS</small></span><span><b>{simulationRecord?.bestScore || 0}</b><small>BEST</small></span></div>
        <label className="mission-world-role"><span>PROFESSIONAL ROLE</span><select disabled={!capstoneUnlocked} value={simulationConfig.role} onChange={(event) => setSimulationConfig((current) => ({ ...current, role: event.target.value as SimulationConfiguration["role"] }))}><option value="">Assign responsibility</option>{scenario.roles.map((roleName) => <option key={roleName}>{roleName}</option>)}</select></label>
        <div className="mission-world-toolbelt"><span><Wrench/> EQUIP TOOLBELT</span>{scenario.tools.map((entry) => <button key={entry.id} disabled={!capstoneUnlocked} className={simulationConfig.toolIds.includes(entry.id) ? "equipped" : ""} aria-pressed={simulationConfig.toolIds.includes(entry.id)} onClick={() => toggleTool(entry.id)} title={entry.purpose}><b>{entry.label}</b><small>{entry.cost} cr / {entry.minutes} min</small></button>)}</div>
        <div className="mission-world-safeguards"><span><ShieldCheck/> SAFETY AND GOVERNANCE</span>{scenario.safeguards.map((entry) => <button key={entry.id} disabled={!capstoneUnlocked} className={simulationConfig.safeguardIds.includes(entry.id) ? "equipped" : ""} aria-pressed={simulationConfig.safeguardIds.includes(entry.id)} onClick={() => toggleSafeguard(entry.id)}><i>{entry.critical ? "REQUIRED" : "CONTROL"}</i><b>{entry.label}</b><small>{entry.cost} cr</small></button>)}</div>
        <label className="mission-world-plan"><span>SOLUTION PLAN</span><textarea disabled={!capstoneUnlocked} maxLength={2000} value={simulationConfig.plan} onChange={(event) => setSimulationConfig((current) => ({ ...current, plan: event.target.value }))} placeholder={scenario.requiredOutcome}/></label>
        {activeWorld.activity === "sequence" && <div className="mission-world-sequence"><div>{activeWorld.sequence?.map((phase) => <button key={phase} disabled={!capstoneUnlocked || sequence.includes(phase)} onClick={() => { const next = [...sequence, phase]; setSequence(next); if (next.join("|") === activeWorld.sequence?.join("|")) { setRuntime((current) => ({ ...current, status: "ready" })); setFeedback("Sense, Plan, Act is ready to certify."); } else if (next.length === 3) failAttempt("Sequence incorrect. Reset the control loop and retry."); else setFeedback("Add the next rover phase."); }}>{phase}</button>)}</div><output>{sequence.length ? sequence.join(" -> ") : "Select the first phase"}</output><button className="icon-button" onClick={() => setSequence([])} aria-label="Reset sequence" title="Reset sequence"><RotateCcw/></button></div>}
        {activeWorld.activity === "builder" && <div className="mission-world-builder"><Box/><span><b>{builtCount}/3 structures placed</b><small>{capstoneUnlocked ? "Click open grid positions in the 3D world." : "Builder grid unlocks after all checkpoints."}</small></span></div>}
        <button className="mission-world-run" disabled={!capstoneUnlocked} onClick={runSimulation}><Play/>Run simulation</button>
        {simulationResult && <section className="mission-world-results"><header><span><Gauge/><b>{simulationResult.score}</b><small>{simulationResult.level}</small></span><strong className={simulationResult.deploymentEligible ? "pass" : "blocked"}>{simulationResult.deploymentEligible ? "REVIEW READY" : "DEPLOYMENT BLOCKED"}</strong></header><div>{Object.entries(simulationResult.scores).map(([dimension, value]) => <span key={dimension}><small>{dimension.replace(/([A-Z])/g, " $1")}</small><b>{Number(value)}</b></span>)}</div><p><b>DYNAMIC EVENT / {simulationResult.event.label}</b>{simulationResult.event.detail}</p>{simulationResult.strengths.map((item) => <p className="strength" key={item}><Check/>{item}</p>)}{simulationResult.consequences.map((item) => <p className="consequence" key={item}><X/>{item}</p>)}<button disabled={!simulationResult.deploymentEligible || !configurationMatchesRun || simulationRecord?.approved} onClick={approveDeployment}><ShieldCheck/>{simulationRecord?.approved ? "Pit Stop approved" : "Approve at human Pit Stop"}</button></section>}
      </div>
      <output className={canComplete ? "ready" : ""}>{feedback}</output>
      <button className="mission-world-complete" disabled={!capstoneUnlocked || !canComplete} onClick={complete}>{completed ? <BadgeCheck/> : <Zap/>}{completed ? "Run again" : "Complete and issue proof"}</button>
    </aside>

    <aside className="mission-world-hud mission-world-vault">
      <header><span><Award/><b>Rewards Vault</b></span><strong>{group.current} / {rank}</strong></header>
      <div className="mission-world-xp"><span style={{ width: `${(progress.xp % 250) / 2.5}%` }}/></div>
      <small>{nextLevelXP} XP to Level {level + 1}</small>
      <div className="mission-world-badges">{MISSION_WORLD_BADGES.map((badge) => <span key={badge} className={progress.badges.includes(badge) ? "unlocked" : ""} title={badge}><Trophy/></span>)}</div>
      <div className="mission-world-modes" role="group" aria-label="Mission World session mode">{SESSION_MODES.map((mode) => <button key={mode.id} className={progress.mode === mode.id ? "active" : ""} onClick={() => setMode(mode.id)} title={mode.description}>{mode.id === "solo" ? <Gamepad2/> : <Users/>}{mode.label}</button>)}</div>
      <small className="mission-world-network">{multiplayerStatus(progress.mode)}</small>
      <div className="mission-world-experience-modes" role="group" aria-label="Mission World display mode">{(["web", "ar", "vr", "mr"] as ExperienceMode[]).map((mode) => <button key={mode} className={experienceMode === mode ? "active" : ""} disabled={mode !== "web" && !MISSION_WORLD_FEATURES.webXR} onClick={() => void selectExperienceMode(mode)}>{mode.toUpperCase()}</button>)}</div>
      <small className="mission-world-xr-status" aria-live="polite">{xrStatus}</small>
      <details><summary>Leaderboard / platform</summary><select aria-label="Leaderboard scope" value={leaderboardScope} onChange={(event) => setLeaderboardScope(event.target.value as LeaderboardScope)}>{LEADERBOARD_SCOPES.map((scope) => <option key={scope}>{scope}</option>)}</select>{leaderboardScope === "individual" ? <span className="active"><b>1. {member.profile?.display_name || "You"}</b><small>{progress.xp} XP</small></span> : <p>Connect a Skill Pod or organization API to load the {leaderboardScope} board.</p>}<p><Cpu/> WebXR {xrCapabilities?.webXR ? "ready" : "not detected"} / VR {xrCapabilities?.immersiveVR ? "ready" : "off"} / AR {xrCapabilities?.immersiveAR ? "ready" : "off"} / OPPRRC ready</p></details>
      <footer><Link to="/profile"><Award/>Passport</Link><Link to="/wallet"><LockKeyhole/>Proof wallet</Link><button onClick={resetProgress} title="Reset Mission World progress"><RotateCcw/></button></footer>
    </aside>
    <div className={`mission-world-toast ${toast ? "show" : ""}`} aria-live="polite"><Sparkles/><span><b>Reward secured</b><small>{toast}</small></span><button onClick={() => setToast("")} aria-label="Dismiss reward"><X/></button></div>
    {tourOpen && <MissionWorldTour step={tourStep} onStep={setTourStep} onClose={closeTour}/>}
  </div>;
}

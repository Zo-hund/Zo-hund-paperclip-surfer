import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Award, BadgeCheck, BookOpen, Bot, Box, Check, Clock3, Coins, Cpu, Gamepad2, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Trophy, Users, X, Zap } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useAMX } from "./AppContext";
import { useMemberAuth } from "./member-auth";
import { awardBadge, trackEvent } from "./platform";
import {
  EMPTY_MISSION_WORLD_PROGRESS, MISSION_WORLD_BADGES, MISSION_WORLDS, missionWorldLevel,
  missionWorldRank, readMissionWorldProgress, type MissionWorldDefinition, type MissionWorldId, type MissionWorldMode,
  type MissionWorldProgress,
} from "./mission-world-data";
import { applyMissionReward } from "./mission-world/gamification";
import { allLessonsComplete, createMissionRuntime, formatMissionTime, objectiveProgress } from "./mission-world/mission-engine";
import { LEADERBOARD_SCOPES, multiplayerStatus, SESSION_MODES } from "./mission-world/multiplayer";
import { issueMissionWorldProof } from "./mission-world/opprrc";
import { completeLesson, recordAttempt, saveMissionWorldProgress } from "./mission-world/progress-store";
import type { LeaderboardScope, MissionRuntimeState, XRCapabilities } from "./mission-world/types";
import { detectXRCapabilities } from "./mission-world/xr-capabilities";
import "./mission-world.css";
import "./mission-world-entry.css";

function MissionWorldScene({ activeId, builderActive, reducedMotion, onPortal, onBuilt }: {
  activeId: MissionWorldId;
  builderActive: boolean;
  reducedMotion: boolean;
  onPortal: (id: MissionWorldId) => void;
  onBuilt: (count: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeId);
  const builderRef = useRef(builderActive);
  const onPortalRef = useRef(onPortal);
  const onBuiltRef = useRef(onBuilt);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => { builderRef.current = builderActive; }, [builderActive]);
  useEffect(() => { onPortalRef.current = onPortal; }, [onPortal]);
  useEffect(() => { onBuiltRef.current = onBuilt; }, [onBuilt]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02070b);
    scene.fog = new THREE.FogExp2(0x02070b, 0.022);
    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 180);
    camera.position.set(0, 13, 25);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
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
    const pointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const portalHit = raycaster.intersectObjects(portalMeshes, false)[0];
      if (portalHit) {
        onPortalRef.current(portalHit.object.userData.missionId as MissionWorldId);
        return;
      }
      if (!builderRef.current) return;
      const floorHit = raycaster.intersectObject(floor, false)[0];
      if (!floorHit) return;
      const geometries = [new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.62, 24, 16), new THREE.CylinderGeometry(0.58, 0.58, 1.2, 24)];
      const mesh = new THREE.Mesh(geometries[built.length % geometries.length], new THREE.MeshStandardMaterial({ color: [0x55e6ff, 0xff75d8, 0x5ee4a8][built.length % 3], metalness: 0.35, roughness: 0.28 }));
      mesh.position.set(Math.round(floorHit.point.x), 0.62, Math.round(floorHit.point.z));
      mesh.castShadow = true;
      world.add(mesh);
      built.push(mesh);
      onBuiltRef.current(built.length);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);

    let frameId = 0;
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
      frameId = requestAnimationFrame(render);
    };
    render();
    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
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
  const [answer, setAnswer] = useState("");
  const [sequence, setSequence] = useState<string[]>([]);
  const [builtCount, setBuiltCount] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [feedback, setFeedback] = useState("Choose an answer to run the simulation.");
  const [toast, setToast] = useState("");
  const startedAt = useRef(Date.now());
  const activeWorld = MISSION_WORLDS.find((world) => world.id === activeId) || MISSION_WORLDS[0];
  const completed = progress.completed.includes(activeId);
  const level = missionWorldLevel(progress.xp);
  const rank = missionWorldRank(level);
  const lessonProgress = objectiveProgress(activeWorld, progress);
  const capstoneUnlocked = allLessonsComplete(activeWorld, progress);
  const activeLesson = activeWorld.lessons[Math.min(lessonIndex, activeWorld.lessons.length - 1)];
  const canComplete = activeWorld.activity === "builder" ? builtCount >= 3
    : activeWorld.activity === "sequence" ? sequence.join("|") === activeWorld.sequence?.join("|")
      : answer === activeWorld.correct;

  const selectWorld = useCallback((id: MissionWorldId) => {
    setActiveId(id);
    setLessonIndex(0);
    setRuntime(createMissionRuntime(id));
    setAnswer("");
    setSequence([]);
    setFeedback("Choose an answer to run the simulation.");
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    detectXRCapabilities().then(setXRCapabilities);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setRuntime((current) => ({ ...current, elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000) })), 1000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  const setMode = (mode: MissionWorldMode) => {
    const next = { ...progress, mode };
    setProgress(next);
    saveMissionWorldProgress(next);
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

  const complete = () => {
    if (!capstoneUnlocked) {
      setFeedback(`Complete all ${activeWorld.lessons.length} learning checkpoints to unlock the capstone.`);
      return;
    }
    if (!canComplete) {
      setFeedback(activeWorld.activity === "builder" ? "Place at least three structures on the grid." : "That simulation is not complete yet. Try the mission sequence again.");
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
    const evidenceProof = issueMissionWorldProof({ world: activeWorld, role, rewardXP, startedAt: startedAt.current, mode: progress.mode, completedLessons: next.lessons[activeId] || [], canvas });
    setLatestProof(evidenceProof);
    refreshRewards();
    trackEvent("mission_world_rewarded", { missionId: evidenceProof.missionId, role });
    setRuntime((current) => ({ ...current, status: "passed" }));
    setFeedback("Simulation passed. OPPRRC evidence and certificate are ready in your Proof Wallet.");
    setToast(`+${rewardXP} XP / +${rewardCoins} AMX Coins / ${activeWorld.badge}`);
    window.setTimeout(() => setToast(""), 3200);
  };

  const resetProgress = () => {
    setProgress(EMPTY_MISSION_WORLD_PROGRESS);
    saveMissionWorldProgress(EMPTY_MISSION_WORLD_PROGRESS);
    setAnswer("");
    setSequence([]);
    setBuiltCount(0);
    setLessonIndex(0);
    setRuntime(createMissionRuntime(activeId));
    setSceneRevision((value) => value + 1);
    setFeedback("Mission World progress reset. Global proof records remain intact.");
  };

  const nextLevelXP = 250 - (progress.xp % 250);
  const totalLessons = MISSION_WORLDS.reduce((total, world) => total + (progress.lessons[world.id]?.length || 0), 0);
  return <div className="mission-world-page">
    <MissionWorldScene key={sceneRevision} activeId={activeId} builderActive={activeId === "builder" && capstoneUnlocked} reducedMotion={settings.reducedMotion} onPortal={selectWorld} onBuilt={setBuiltCount}/>
    <header className="mission-world-hud mission-world-topbar">
      <div><Link className="mission-world-exit" to="/missions" aria-label="Exit Mission World" title="Exit Mission World"><X/></Link><span className="eyebrow">AMX AIR HUBS / LEARN - BUILD - EARN</span><h1>Mission World</h1></div>
      <div className="mission-world-stats"><span><b>{level}</b><small>LEVEL</small></span><span><b>{progress.xp}</b><small>WORLD XP</small></span><span><b>{progress.coins}</b><small>AMX COINS</small></span><span><b>{totalLessons}/30</b><small>CHECKPOINTS</small></span><span><b>{progress.completed.length}/5</b><small>CAPSTONES</small></span></div>
    </header>

    <nav className="mission-world-hud mission-world-dock" aria-label="Mission World portals">
      {MISSION_WORLDS.map((world) => <button key={world.id} className={`${activeId === world.id ? "active" : ""} ${progress.completed.includes(world.id) ? "complete" : ""}`} style={{ "--world-color": world.color } as React.CSSProperties} onClick={() => selectWorld(world.id)}><i/>{progress.completed.includes(world.id) ? <Check/> : <Gamepad2/>}<span>{world.shortLabel}</span></button>)}
    </nav>

    <aside className="mission-world-hud mission-world-briefing" style={{ "--world-color": activeWorld.color } as React.CSSProperties}>
      <header><div><span className="eyebrow">{completed ? "MISSION COMPLETE" : capstoneUnlocked ? "CAPSTONE UNLOCKED" : "LEARNING ACTIVE"}</span><h2>{activeWorld.title}</h2></div><b><Clock3/> {formatMissionTime(runtime.elapsedSeconds)}</b></header>
      <p>{activeWorld.description}</p>
      <div className="mission-world-lesson-rail" aria-label={`${activeWorld.title} learning checkpoints`}>
        {activeWorld.lessons.map((lesson, index) => <button key={lesson.id} className={`${lessonIndex === index ? "active" : ""} ${progress.lessons[activeId]?.includes(lesson.id) ? "complete" : ""}`} onClick={() => setLessonIndex(index)} title={lesson.title}>{progress.lessons[activeId]?.includes(lesson.id) ? <Check/> : index + 1}</button>)}
      </div>
      <section className="mission-world-lesson"><BookOpen/><div><b>{activeLesson.title}</b><p>{activeLesson.brief}</p><small>DO: {activeLesson.practice}</small></div></section>
      <button className="mission-world-checkpoint" onClick={markLessonComplete}>{progress.lessons[activeId]?.includes(activeLesson.id) ? <Check/> : <Zap/>}{progress.lessons[activeId]?.includes(activeLesson.id) ? "Checkpoint complete / next" : "Complete checkpoint"}</button>
      <div className="mission-world-capstone"><span><b>CAPSTONE</b><small>{lessonProgress.complete}/{lessonProgress.total} checkpoints / difficulty {activeWorld.difficulty}</small></span><strong>{capstoneUnlocked ? `+${activeWorld.xp} XP` : "LOCKED"}</strong></div>
      <div className={`mission-world-capstone-body ${capstoneUnlocked ? "unlocked" : ""}`} aria-disabled={!capstoneUnlocked}>
        <div className="mission-world-objective"><Bot/><span><b>{activeWorld.agentId.toUpperCase()} OBJECTIVE</b><small>{capstoneUnlocked ? activeWorld.prompt : "Finish the learning path to activate this simulation."}</small></span></div>
        {activeWorld.activity === "choice" && <div className="mission-world-options">{activeWorld.options?.map((option) => <button key={option} disabled={!capstoneUnlocked} className={answer === option ? "selected" : ""} onClick={() => { setAnswer(option); if (option === activeWorld.correct) { setRuntime((current) => ({ ...current, status: "ready" })); setFeedback("Correct. The simulation is ready to certify."); } else failAttempt("That path fails the safety or governance check. Review the lesson and retry."); }}><span>{answer === option ? <Check/> : <ShieldCheck/>}</span>{option}</button>)}</div>}
        {activeWorld.activity === "sequence" && <div className="mission-world-sequence"><div>{activeWorld.sequence?.map((phase) => <button key={phase} disabled={!capstoneUnlocked || sequence.includes(phase)} onClick={() => { const next = [...sequence, phase]; setSequence(next); if (next.join("|") === activeWorld.sequence?.join("|")) { setRuntime((current) => ({ ...current, status: "ready" })); setFeedback("Sense, Plan, Act is ready to certify."); } else if (next.length === 3) failAttempt("Sequence incorrect. Reset the control loop and retry."); else setFeedback("Add the next rover phase."); }}>{phase}</button>)}</div><output>{sequence.length ? sequence.join(" -> ") : "Select the first phase"}</output><button className="icon-button" onClick={() => setSequence([])} aria-label="Reset sequence" title="Reset sequence"><RotateCcw/></button></div>}
        {activeWorld.activity === "builder" && <div className="mission-world-builder"><Box/><span><b>{builtCount}/3 structures placed</b><small>{capstoneUnlocked ? "Click open grid positions in the 3D world." : "Builder grid unlocks after all checkpoints."}</small></span></div>}
      </div>
      <output className={canComplete ? "ready" : ""}>{feedback}</output>
      <button className="mission-world-complete" disabled={!capstoneUnlocked || !canComplete} onClick={complete}>{completed ? <BadgeCheck/> : <Zap/>}{completed ? "Run again" : "Complete and issue proof"}</button>
    </aside>

    <aside className="mission-world-hud mission-world-vault">
      <header><span><Award/><b>Rewards Vault</b></span><strong>{rank}</strong></header>
      <div className="mission-world-xp"><span style={{ width: `${(progress.xp % 250) / 2.5}%` }}/></div>
      <small>{nextLevelXP} XP to Level {level + 1}</small>
      <div className="mission-world-badges">{MISSION_WORLD_BADGES.map((badge) => <span key={badge} className={progress.badges.includes(badge) ? "unlocked" : ""} title={badge}><Trophy/></span>)}</div>
      <div className="mission-world-modes" role="group" aria-label="Mission World session mode">{SESSION_MODES.map((mode) => <button key={mode.id} className={progress.mode === mode.id ? "active" : ""} onClick={() => setMode(mode.id)} title={mode.description}>{mode.id === "solo" ? <Gamepad2/> : <Users/>}{mode.label}</button>)}</div>
      <small className="mission-world-network">{multiplayerStatus(progress.mode)}</small>
      <details><summary>Leaderboard / platform</summary><select aria-label="Leaderboard scope" value={leaderboardScope} onChange={(event) => setLeaderboardScope(event.target.value as LeaderboardScope)}>{LEADERBOARD_SCOPES.map((scope) => <option key={scope}>{scope}</option>)}</select>{leaderboardScope === "individual" ? <span className="active"><b>1. {member.profile?.display_name || "You"}</b><small>{progress.xp} XP</small></span> : <p>Connect a Skill Pod or organization API to load the {leaderboardScope} board.</p>}<p><Cpu/> WebXR {xrCapabilities?.webXR ? "ready" : "not detected"} / VR {xrCapabilities?.immersiveVR ? "ready" : "off"} / AR {xrCapabilities?.immersiveAR ? "ready" : "off"} / OPPRRC ready</p></details>
      <footer><Link to="/wallet"><LockKeyhole/>Proof wallet</Link><button onClick={resetProgress} title="Reset Mission World progress"><RotateCcw/></button></footer>
    </aside>
    <div className={`mission-world-toast ${toast ? "show" : ""}`} aria-live="polite"><Sparkles/><span><b>Reward secured</b><small>{toast}</small></span><button onClick={() => setToast("")} aria-label="Dismiss reward"><X/></button></div>
  </div>;
}

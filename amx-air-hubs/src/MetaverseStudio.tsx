import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Code2, Gamepad2, RadioTower, RefreshCw, Send, Sparkles, Users, X } from "lucide-react";
import * as THREE from "three";
import { agents } from "./data";
import { sendAgentRequest } from "./agent-runtime";
import type { NexusRoomControl, NexusSessionMessage } from "./nexus-room-control";
import { defaultMetaverseSession, normalizeOrganizationTags, parseWorldBlueprint, type MetaverseEventType, type MetaverseMode, type MetaverseSessionState, type WorldBlueprint } from "./metaverse-session";
import { getActiveTenant } from "./operations";
import { getTenantRecord } from "./tenant-management";
import { useShowcasePromotions } from "./showcase-promotions";

interface Props {
  roomCode: string;
  control: NexusRoomControl | null;
  incoming: NexusSessionMessage | null;
}

const MODES: Array<{ id: MetaverseMode; label: string; detail: string }> = [
  { id: "solo", label: "Solo", detail: "One builder + agents" },
  { id: "co-op", label: "Co-op", detail: "Shared pod build" },
  { id: "teams", label: "Teams", detail: "Crew vs brief" },
];

function WorldBlueprintPreview({ blueprint }: { blueprint: WorldBlueprint | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !blueprint) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(blueprint.environment === "space" ? 0x01030a : blueprint.environment === "grid" ? 0x071014 : 0x05090e);
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 3.1, 5.8);
    camera.lookAt(0, 0.8, -2.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xbbefff, 0x17212a, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 7, 5);
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18, 18, 18), new THREE.MeshStandardMaterial({ color: 0x0b171c, roughness: 0.82, metalness: 0.35, wireframe: blueprint.environment === "grid" }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const root = new THREE.Group();
    scene.add(root);
    blueprint.entities.forEach((entity) => {
      const geometry = entity.primitive === "sphere" ? new THREE.SphereGeometry(0.5, 28, 20)
        : entity.primitive === "cylinder" ? new THREE.CylinderGeometry(0.5, 0.5, 1, 28)
          : entity.primitive === "torus" ? new THREE.TorusGeometry(0.5, 0.16, 16, 36)
            : new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ color: entity.color, roughness: 0.28, metalness: 0.55, emissive: entity.color, emissiveIntensity: 0.08 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = entity.name;
      mesh.position.set(...entity.position);
      mesh.scale.set(...entity.scale);
      mesh.castShadow = true;
      root.add(mesh);
    });
    let frame = 0;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      root.rotation.y = Math.sin(performance.now() * 0.00025) * 0.08;
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [blueprint]);
  return <div className="metaverse-world-preview" ref={hostRef} aria-label={blueprint ? `${blueprint.title} live Three.js preview` : "World preview unavailable"}/>;
}

export function MetaverseStudio({ roomCode, control, incoming }: Props) {
  const tenant = useMemo(() => getTenantRecord(getActiveTenant()), []);
  const [session, setSession] = useState<MetaverseSessionState>(() => defaultMetaverseSession(tenant.id, tenant.name));
  const [draft, setDraft] = useState(session.deliverable.code);
  const [tagDraft, setTagDraft] = useState(session.organizationTags.join(", "));
  const [notice, setNotice] = useState("Join the room to synchronize the build.");
  const [agentOutput, setAgentOutput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const promotions = useShowcasePromotions();
  const parsed = useMemo(() => parseWorldBlueprint(draft), [draft]);
  const activePromotion = promotions.promotions.find((item) => item.roomCode === roomCode && item.deliverableId === session.deliverable.id);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const sendState = useCallback(async (next: MetaverseSessionState) => {
    setSession(next);
    sessionRef.current = next;
    const sent = await control?.sendSessionMessage({ kind: "session-state", senderName: "AMX Builder", state: next });
    setNotice(sent ? `Revision ${next.deliverable.revision} synchronized.` : "Saved locally. Join the pod to synchronize.");
  }, [control]);

  useEffect(() => {
    if (!incoming) return;
    if (incoming.kind === "session-request") {
      void control?.sendSessionMessage({ kind: "session-state", senderName: "AMX Builder", state: sessionRef.current });
      return;
    }
    if (!incoming.state || incoming.state.deliverable.revision < sessionRef.current.deliverable.revision) return;
    setSession(incoming.state);
    sessionRef.current = incoming.state;
    setDraft(incoming.state.deliverable.code);
    setTagDraft(incoming.state.organizationTags.join(", "));
    setNotice(`${incoming.senderName} synchronized the world.`);
  }, [control, incoming]);

  useEffect(() => {
    if (!control?.connected) return;
    void control.sendSessionMessage({ kind: "session-request", senderName: "AMX Builder" });
  }, [control]);

  const updateSession = (patch: Partial<MetaverseSessionState>) => void sendState({ ...sessionRef.current, ...patch });
  const publishCode = () => {
    if (!parsed.blueprint) { setNotice(parsed.error); return; }
    const revision = Math.max(Date.now(), sessionRef.current.deliverable.revision + 1);
    void sendState({
      ...sessionRef.current,
      status: "building",
      organizationTags: normalizeOrganizationTags(tagDraft.split(",")),
      deliverable: { ...sessionRef.current.deliverable, title: parsed.blueprint.title, code: draft, revision, updatedAt: Date.now(), updatedBy: "AMX Builder" },
    });
  };
  const askAgent = async () => {
    setAgentBusy(true);
    setAgentOutput("");
    try {
      const response = await sendAgentRequest(agents.find((agent) => agent.id === "zohund") || agents[0], `You are the in-world Three.js build partner. Review this safe JSON world blueprint for a ${session.mode} ${session.eventType}. Give three concise improvements, then return one valid entity JSON object that can be added to entities.\n\n${draft}`, [], "code");
      setAgentOutput(response.text);
    } catch (error) {
      setAgentOutput(error instanceof Error ? error.message : "Agent review could not run.");
    } finally {
      setAgentBusy(false);
    }
  };
  const requestPromotion = () => {
    if (!parsed.blueprint) { setNotice(parsed.error); return; }
    const ready = { ...sessionRef.current, status: "showcase-ready" as const };
    void sendState(ready);
    const promotion = promotions.submit({
      roomCode, title: ready.deliverable.title, mode: ready.mode, eventType: ready.eventType,
      organizationId: ready.organizationId, organizationName: ready.organizationName, organizationTags: ready.organizationTags,
      deliverableId: ready.deliverable.id, deliverableRevision: ready.deliverable.revision, requestedBy: "AMX Builder",
    });
    setNotice(`Showcase request ${promotion.id.slice(0, 8)} sent to XR Stage approval.`);
  };

  return <section className="metaverse-studio" aria-label="Realtime multiplayer world studio">
    <header><div><span className="eyebrow">MULTIPLAYER WEBGL STUDIO</span><h2>Build inside the pod</h2></div><span className={`metaverse-transport ${control?.connected ? "live" : ""}`}><i/>{control?.connected ? "ROOM LIVE" : "LOCAL"}</span></header>
    <div className="metaverse-mode" aria-label="Session mode">{MODES.map((mode) => <button key={mode.id} className={session.mode === mode.id ? "active" : ""} onClick={() => updateSession({ mode: mode.id })}><Gamepad2/><span><b>{mode.label}</b><small>{mode.detail}</small></span></button>)}</div>
    <div className="metaverse-session-fields"><label>Team<input value={session.teamName} maxLength={48} onChange={(event) => { const next = { ...sessionRef.current, teamName: event.target.value }; sessionRef.current = next; setSession(next); }} onBlur={() => updateSession({ teamName: sessionRef.current.teamName })}/></label><label>Stage format<select value={session.eventType} onChange={(event) => updateSession({ eventType: event.target.value as MetaverseEventType })}>{(["showcase", "summit", "conference", "expo"] as const).map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <label className="metaverse-org-tags">Organization tags<input value={tagDraft} maxLength={120} onChange={(event) => setTagDraft(event.target.value)} onBlur={() => updateSession({ organizationTags: normalizeOrganizationTags(tagDraft.split(",")) })}/><small>{tenant.name} / tags travel with the stage request</small></label>
    <WorldBlueprintPreview blueprint={parsed.blueprint}/>
    <div className="metaverse-code-head"><span><Code2/><b>WORLD.BLUEPRINT.JSON</b></span><span>{parsed.blueprint ? `${parsed.blueprint.entities.length} ENTITIES` : "INVALID"}</span></div>
    <textarea className="metaverse-code-editor" spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Shared world blueprint code"/>
    {parsed.error && <p className="metaverse-code-error"><X/>{parsed.error}</p>}
    <div className="metaverse-code-actions"><button onClick={publishCode} disabled={!parsed.blueprint}><Send/>SYNC BUILD</button><button onClick={() => void askAgent()} disabled={agentBusy}><Bot/>{agentBusy ? "REVIEWING" : "CODE WITH AGENT"}</button></div>
    {agentOutput && <div className="metaverse-agent-output"><Sparkles/><p>{agentOutput}</p></div>}
    <div className="metaverse-showcase"><span><RadioTower/><span><b>XR STAGE PIPELINE</b><small>{session.organizationName} / {session.eventType} / {promotions.transport}</small></span></span><button onClick={requestPromotion} disabled={activePromotion?.status === "pending"}>{activePromotion?.status === "approved" ? <Check/> : activePromotion?.status === "declined" ? <RefreshCw/> : <RadioTower/>}{activePromotion?.status === "pending" ? "AWAITING APPROVAL" : activePromotion?.status === "approved" ? "STAGE APPROVED" : "REQUEST SHOWCASE"}</button></div>
    <p className="metaverse-notice" role="status"><Users/>{notice}</p>
  </section>;
}

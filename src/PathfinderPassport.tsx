import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, BadgeCheck, BookOpenCheck, Boxes, BriefcaseBusiness, Check, CircleDollarSign, Compass, ExternalLink, LockKeyhole, Network, ShieldCheck, Sparkles, Trophy, UserRound, Wrench, X } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useMemberAuth } from "./member-auth";
import { pathfinderCollectibles, deploymentReadiness, pathfinderGroup, pathfinderPillars, type PathfinderCollectible } from "./mission-world/pathfinder";
import { readMissionWorldProgress } from "./mission-world/progress-store";
import "./pathfinder-passport.css";

export type PathfinderView = "passport" | "collectibles" | "evidence" | "credentials" | "deployments";

function CollectibleVaultScene({ collectibles }: { collectibles: PathfinderCollectible[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03080b);
    scene.fog = new THREE.Fog(0x03080b, 12, 30);
    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, .1, 50);
    camera.position.set(0, 5.4, 13);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 18;
    controls.target.set(0, 1.2, 0);
    scene.add(new THREE.HemisphereLight(0xd8f7ff, 0x12071a, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 4);
    key.position.set(5, 9, 7);
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, .7, 64), new THREE.MeshStandardMaterial({ color: 0x09171e, metalness: .75, roughness: .24 }));
    floor.position.y = -.4;
    scene.add(floor);
    const coins: THREE.Group[] = [];
    collectibles.forEach((collectible, index) => {
      const angle = index / collectibles.length * Math.PI * 2 - Math.PI / 2;
      const group = new THREE.Group();
      group.position.set(Math.cos(angle) * 4.6, 1 + (index % 2) * .45, Math.sin(angle) * 4.6);
      const color = new THREE.Color(collectible.color);
      const material = new THREE.MeshStandardMaterial({ color: collectible.unlocked ? color : 0x26343a, emissive: collectible.unlocked ? color : new THREE.Color(0x000000), emissiveIntensity: collectible.unlocked ? .5 : 0, metalness: .82, roughness: .2 });
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(.82, .82, .18, 48), material);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
      const mark = new THREE.Mesh(new THREE.TorusGeometry(.48, .07, 12, 36), new THREE.MeshBasicMaterial({ color: collectible.unlocked ? 0xffffff : 0x526168 }));
      mark.position.z = .11;
      group.add(mark);
      scene.add(group);
      coins.push(group);
    });
    let frame = 0;
    const clock = new THREE.Clock();
    const render = () => {
      const elapsed = clock.getElapsedTime();
      coins.forEach((coin, index) => { coin.rotation.y = elapsed * .18 + index * .32; coin.position.y += Math.sin(elapsed * 1.2 + index) * .0008; });
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    const resize = () => { if (!mount.clientWidth || !mount.clientHeight) return; camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [collectibles]);
  return <div className="pathfinder-vault-scene" ref={mountRef} aria-label="Interactive Three.js Pathfinder collectible vault"/>;
}

const viewRoutes: Array<{ id: PathfinderView; label: string; path: string }> = [
  { id: "passport", label: "Passport", path: "/profile" }, { id: "collectibles", label: "Collectibles", path: "/profile/collectibles" },
  { id: "evidence", label: "Evidence", path: "/profile/evidence" }, { id: "credentials", label: "Credentials", path: "/profile/credentials" },
  { id: "deployments", label: "Deployments", path: "/profile/deployments" },
];

export function PathfinderPassportPage({ view = "passport" }: { view?: PathfinderView }) {
  const member = useMemberAuth();
  const progress = useMemo(readMissionWorldProgress, []);
  const pillars = pathfinderPillars(progress);
  const group = pathfinderGroup(progress);
  const collectibles = pathfinderCollectibles(progress);
  const readiness = deploymentReadiness(progress);
  const unlocked = collectibles.filter((item) => item.unlocked);
  return <div className="page pathfinder-page">
    <header className="pathfinder-header"><div><span className="eyebrow">XRT PATHFINDER PASSPORT / LOUISVILLE + KENTUCKY</span><h1>{member.profile?.display_name || "Pathfinder"}</h1><p>Real time. Real skills. Real proof. Real deployment. Real earning.</p></div><div className="pathfinder-identity"><UserRound/><span><b>{group.current}</b><small>{group.next ? `${group.progress}% to ${group.next}` : "Deployment leader"}</small></span></div></header>
    <nav className="pathfinder-tabs" aria-label="Pathfinder profile views">{viewRoutes.map((item) => <Link key={item.id} className={view === item.id ? "active" : ""} to={item.path}>{item.label}</Link>)}</nav>
    {(view === "passport" || view === "collectibles") && <section className="pathfinder-vault"><CollectibleVaultScene collectibles={collectibles}/><div className="pathfinder-vault-summary"><span className="eyebrow">DIGITAL TWIN REWARD VAULT</span><h2>{unlocked.length}/{collectibles.length} collectibles unlocked</h2><p>Each object is backed by mission state and links to its available skill evidence. Locked objects cannot be issued or printed.</p><Link className="button primary" to="/missions/world"><Compass/>Continue missions</Link></div></section>}
    {view === "passport" && <>
      <section className="pathfinder-scorecards"><Scorecard title="Learn to Know / Do / Be" icon={<BookOpenCheck/>} values={pillars.training}/><Scorecard title="Create / Curate / Connect" icon={<Network/>} values={pillars.zkode}/></section>
      <section className="pathfinder-band"><div><span className="eyebrow">CURRENT GROUP</span><h2>{group.current}</h2><p>{group.reason}</p></div><div className="pathfinder-group-track"><span className="active">Explorer</span><i/><span className={group.current !== "Explorer" ? "active" : ""}>Builder</span><i/><span className={group.current === "Ambassador" ? "active" : ""}>Ambassador</span></div></section>
    </>}
    {(view === "passport" || view === "collectibles" || view === "credentials") && <CollectibleGrid collectibles={collectibles} credentialsOnly={view === "credentials"}/>}
    {(view === "passport" || view === "deployments") && <section className="pathfinder-readiness"><header><div><span className="eyebrow">FIELD DEPLOYMENT GATE</span><h2>{readiness.ready ? "Field ready" : "Evidence still required"}</h2></div><strong>{readiness.score}%</strong></header><div>{readiness.requirements.map((item) => <span key={item.id} className={item.complete ? "complete" : ""}>{item.complete ? <Check/> : <X/>}<b>{item.label}</b><small>{item.evidence}</small></span>)}</div><p><ShieldCheck/>No deployment or earning status is granted until every required review record is present.</p></section>}
    {view === "evidence" && <section className="pathfinder-empty"><LockKeyhole/><h2>OPPRRC evidence lives in the Proof Wallet</h2><p>Mission screenshots, scores, tools, safeguards, events, approvals, reports, badges, and certificates are managed by the existing proof system.</p><Link className="button primary" to="/wallet">Open Proof Wallet<ExternalLink/></Link></section>}
  </div>;
}

function Scorecard({ title, icon, values }: { title: string; icon: React.ReactNode; values: Record<string, number> }) {
  return <article><header>{icon}<h2>{title}</h2></header>{Object.entries(values).map(([label, value]) => <div key={label}><span><b>{label}</b><small>{value}%</small></span><i><em style={{ width: `${value}%` }}/></i></div>)}</article>;
}

function CollectibleGrid({ collectibles, credentialsOnly }: { collectibles: PathfinderCollectible[]; credentialsOnly: boolean }) {
  const visible = credentialsOnly ? collectibles.filter((item) => item.credentialId) : collectibles;
  return <section className="pathfinder-collectibles"><header><div><span className="eyebrow">PROOF-OF-SKILL COLLECTIBLES</span><h2>{credentialsOnly ? "Issued credentials" : "Physical and digital twins"}</h2></div><Award/></header><div>{visible.map((item) => <article key={item.id} className={item.unlocked ? "unlocked" : "locked"} style={{ "--collectible-color": item.color } as React.CSSProperties}><span className="pathfinder-coin"><CircleDollarSign/></span><div><small>{item.tier} / {item.physicalFormat}</small><h3>{item.name}</h3><p>{item.skill}</p>{item.credentialId ? <Link to={item.proofRoute}><BadgeCheck/>{item.credentialId}</Link> : <span><LockKeyhole/>Mission evidence required</span>}</div></article>)}</div>{!visible.length && <p>No credentials have been issued yet. Complete an approved simulation first.</p>}</section>;
}

export function PathfinderCredentialPage() {
  const { credentialId = "" } = useParams();
  const collectible = pathfinderCollectibles(readMissionWorldProgress()).find((item) => item.credentialId === credentialId);
  if (!collectible) return <div className="page pathfinder-empty"><LockKeyhole/><h1>Credential not available</h1><p>This browser does not hold a matching verified Mission World record.</p><Link className="button secondary" to="/profile/credentials">Return to credentials</Link></div>;
  return <div className="page pathfinder-credential"><Trophy/><span className="eyebrow">XRT PATHFINDER CREDENTIAL</span><h1>{collectible.name}</h1><p>{collectible.skill}</p><dl><div><dt>Credential</dt><dd>{collectible.credentialId}</dd></div><div><dt>Tier</dt><dd>{collectible.tier}</dd></div><div><dt>Physical twin</dt><dd>{collectible.physicalFormat}</dd></div><div><dt>Status</dt><dd>Evidence linked</dd></div></dl><Link className="button primary" to="/wallet">Inspect OPPRRC proof</Link></div>;
}

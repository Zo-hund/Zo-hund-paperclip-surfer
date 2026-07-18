import { useEffect, useState } from "react";
import { CalendarClock, Copy, Link2, QrCode, Send, ShieldCheck, Trash2, Users } from "lucide-react";
import { QRCodeCard, StatusPill } from "./components";
import { absoluteInviteUrl, createPodInvite, getOwnedPodInvite, resolvePodInvite, revokePodInvite, storeOwnedPodInvite, type PodInvite, type PodInviteRole } from "./pod-invites";
import type { TenantRecord } from "./tenant-management";

interface PodInvitePanelProps {
  pod: { id:string; code:string; name:string; missionId:string };
  tenant: TenantRecord;
  compact?: boolean;
}

export function PodInvitePanel({pod,tenant,compact=false}:PodInvitePanelProps) {
  const [role,setRole]=useState<PodInviteRole>("participant");
  const [expiresInHours,setExpires]=useState(24);
  const [maxUses,setMaxUses]=useState(12);
  const [description,setDescription]=useState("Join this guided AMX showcase, meet the agents, and explore the live Skill Pod together.");
  const [invite,setInvite]=useState<PodInvite>(()=>getOwnedPodInvite(pod.id));
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{const stored=getOwnedPodInvite(pod.id);setInvite(stored);if(stored?.status==="active")void resolvePodInvite(stored.token).then((current)=>{storeOwnedPodInvite(current);setInvite(current)}).catch(()=>{})},[pod.id]);

  const create=async()=>{
    setBusy(true);setNotice("");
    try {
      const created=await createPodInvite({tenantId:tenant.id,tenantName:tenant.name,tenantColor:tenant.color,podId:pod.id,roomCode:pod.code,missionId:pod.missionId,title:`${pod.name} showcase`,description,hostName:"AMX Host",role,maxUses,expiresInHours});
      setInvite(created);setNotice("Private owner key saved on this device.");
    } catch(error) {setNotice(error instanceof Error?error.message:"Invite could not be created.")}
    finally {setBusy(false)}
  };
  const copy=async()=>{if(!invite)return;await navigator.clipboard.writeText(absoluteInviteUrl(invite));setNotice("Showcase link copied.")};
  const share=async()=>{if(!invite)return;const url=absoluteInviteUrl(invite);if(navigator.share)await navigator.share({title:invite.title,text:invite.description,url});else await copy()};
  const revoke=async()=>{if(!invite)return;setBusy(true);try{await revokePodInvite(invite.token);setInvite({...invite,status:"revoked"});setNotice("Invite revoked. Existing links can no longer be accepted.")}catch(error){setNotice(error instanceof Error?error.message:"Invite could not be revoked.")}finally{setBusy(false)}};

  return <section id="pod-showcase-invite" className={`pod-invite-panel ${compact?"compact":""}`}>
    <header><div><span className="eyebrow">SHOWCASE ACCESS</span><h2>Invite people into this pod</h2></div><StatusPill tone={invite?.status==="active"?"green":"cyan"}>{invite?.status||"OWNER CONTROLLED"}</StatusPill></header>
    {!invite?<div className="pod-invite-builder">
      <div className="pod-invite-fields"><label>Guest role<select value={role} onChange={(event)=>setRole(event.target.value as PodInviteRole)}><option value="viewer">Viewer</option><option value="participant">Participant</option><option value="presenter">Presenter</option></select></label><label>Expires<select value={expiresInHours} onChange={(event)=>setExpires(Number(event.target.value))}><option value={1}>1 hour</option><option value={8}>8 hours</option><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option></select></label><label>Guest capacity<input type="number" min="1" max="100" value={maxUses} onChange={(event)=>setMaxUses(Math.min(100,Math.max(1,Number(event.target.value))))}/></label></div>
      {!compact&&<label className="pod-invite-message">Showcase note<textarea maxLength={500} value={description} onChange={(event)=>setDescription(event.target.value)}/></label>}
      <button className="button primary" disabled={busy} onClick={create}><Link2/>{busy?"Creating access...":"Create showcase invite"}</button>
    </div>:<div className="pod-invite-ready"><div className="pod-invite-qr"><QRCodeCard route={invite.joinPath} title={invite.title}/></div><div className="pod-invite-summary"><span><ShieldCheck/>Invite token hides the room until accepted</span><span><Users/>{invite.useCount} / {invite.maxUses} accepted</span><span><CalendarClock/>Expires {new Date(invite.expiresAt).toLocaleString()}</span><code>{absoluteInviteUrl(invite)}</code><div><button className="button secondary" onClick={copy}><Copy/>Copy link</button><button className="button primary" onClick={share}><Send/>Share invite</button><button className="icon-button danger" aria-label="Revoke invite" title="Revoke invite" disabled={busy||invite.status!=="active"} onClick={revoke}><Trash2/></button></div></div></div>}
    {notice&&<p className="pod-invite-notice" role="status"><QrCode/>{notice}</p>}
  </section>;
}

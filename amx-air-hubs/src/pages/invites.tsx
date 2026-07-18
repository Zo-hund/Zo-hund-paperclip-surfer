import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarClock, DoorOpen, Eye, Mic2, Presentation, ShieldCheck, Users } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { useAMX } from "../AppContext";
import { missions } from "../data";
import { joinImmersiveRoomFromInvite } from "../immersive";
import { acceptPodInvite, resolvePodInvite, type PodInvite } from "../pod-invites";

const roleIcons={viewer:Eye,participant:Users,presenter:Presentation};

export function PodInvitePage() {
  const {token=""}=useParams();const navigate=useNavigate();const {role,setActiveMissionId}=useAMX();
  const [invite,setInvite]=useState<PodInvite>();const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void resolvePodInvite(token).then((item)=>{if(active)setInvite(item)}).catch((reason)=>{if(active)setError(reason instanceof Error?reason.message:"This invite is unavailable.")});return()=>{active=false}},[token]);
  const accept=async()=>{if(!invite)return;setBusy(true);setError("");try{const accepted=await acceptPodInvite(token);const mission=missions.find((item)=>item.id===accepted.missionId)||missions[0];setActiveMissionId(mission.id);joinImmersiveRoomFromInvite(accepted,role);navigate(`/rooms/${accepted.podId}/lobby?invite=${encodeURIComponent(token)}`)}catch(reason){setError(reason instanceof Error?reason.message:"This invite could not be accepted.");setBusy(false)}};
  if(error&&!invite)return <div className="page section-wrap invite-error-page"><ShieldCheck/><span className="eyebrow">SHOWCASE INVITE</span><h1>Access unavailable</h1><p>{error}</p><button className="button secondary" onClick={()=>navigate("/")}>Return to AMX AIR Hubs</button></div>;
  if(!invite)return <div className="page section-wrap invite-loading"><span className="live-dot"/><p>Verifying showcase access...</p></div>;
  const RoleIcon=roleIcons[invite.role];
  return <div className="page section-wrap pod-invite-page" style={{"--invite-color":invite.tenantColor} as React.CSSProperties}><PageHeader eyebrow="PRIVATE POD INVITATION" title={invite.title} description={invite.description} actions={<StatusPill tone={invite.status==="active"?"green":"red"}>{invite.status}</StatusPill>}/><section className="pod-invite-pass"><div className="pod-invite-pass-main"><span className="pod-invite-tenant">{invite.tenantName}</span><div className="pod-invite-room"><span>ROOM</span><strong>{invite.roomCode}</strong></div><h2>{missions.find((item)=>item.id===invite.missionId)?.title||"AMX Showcase"}</h2><div className="pod-invite-facts"><span><RoleIcon/>{invite.role}</span><span><CalendarClock/>{new Date(invite.expiresAt).toLocaleString()}</span><span><Users/>{invite.maxUses-invite.useCount} places remaining</span><span><Mic2/>Live room media</span></div></div><aside><ShieldCheck/><h3>Invitation access</h3><p>This link grants the listed pod role. Camera, microphone, screen share, and XR permissions are always requested separately on your device.</p><button className="button primary large full" disabled={busy||invite.status!=="active"} onClick={accept}><DoorOpen/>{busy?"Joining showcase...":"Accept and enter lobby"}</button>{error&&<p className="invite-inline-error" role="alert">{error}</p>}</aside></section></div>;
}

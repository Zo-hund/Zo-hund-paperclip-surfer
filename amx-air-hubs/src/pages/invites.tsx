import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarClock, DoorOpen, Eye, Mic2, Presentation, ShieldCheck, Users } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { useAMX } from "../AppContext";
import { missions } from "../data";
import { joinImmersiveRoomFromInvite } from "../immersive";
import { useMemberAuth } from "../member-auth";
import { acceptPodInvite, podInviteDestination, resolvePodInvite, type PodInvite } from "../pod-invites";

const roleIcons={viewer:Eye,participant:Users,presenter:Presentation};

export function PodInvitePage() {
  const {token=""}=useParams();const navigate=useNavigate();const {role,setActiveMissionId}=useAMX();const member=useMemberAuth();
  const [invite,setInvite]=useState<PodInvite>();const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [zkode,setZkode]=useState("");
  useEffect(()=>{let active=true;void resolvePodInvite(token).then((item)=>{if(active)setInvite(item)}).catch((reason)=>{if(active)setError(reason instanceof Error?reason.message:"This invite is unavailable.")});return()=>{active=false}},[token]);
  const accept=async()=>{if(!invite)return;if(!member.session){navigate(`/account?next=${encodeURIComponent(invite.joinPath)}`);return}if(!zkode.trim()){setError("Enter the ZKODE supplied with this pass.");return}setBusy(true);setError("");try{const accepted=await acceptPodInvite(token,zkode,member.session.access_token);const mission=missions.find((item)=>item.id===accepted.missionId)||missions[0];setActiveMissionId(mission.id);joinImmersiveRoomFromInvite(accepted,role);navigate(podInviteDestination(accepted))}catch(reason){setError(reason instanceof Error?reason.message:"This invite could not be accepted.");setBusy(false)}};
  if(error&&!invite)return <div className="page section-wrap invite-error-page"><ShieldCheck/><span className="eyebrow">SHOWCASE INVITE</span><h1>Access unavailable</h1><p>{error}</p><button className="button secondary" onClick={()=>navigate("/")}>Return to AMX AIR Hubs</button></div>;
  if(!invite)return <div className="page section-wrap invite-loading"><span className="live-dot"/><p>Verifying showcase access...</p></div>;
  const RoleIcon=roleIcons[invite.role];const places=Math.max(0,invite.maxUses-invite.useCount);const signedIn=Boolean(member.session);
  return <div className="page section-wrap pod-invite-page" style={{"--invite-color":invite.tenantColor} as React.CSSProperties}><PageHeader eyebrow="PRIVATE POD INVITATION" title={invite.title} description={invite.description} actions={<StatusPill tone={invite.status==="active"?"green":"red"}>{invite.status}</StatusPill>}/><section className="pod-invite-pass"><div className="pod-invite-pass-main"><span className="pod-invite-tenant">{invite.tenantName}</span><div className="pod-invite-room"><span>ROOM</span><strong>{invite.roomCode}</strong></div><h2>{missions.find((item)=>item.id===invite.missionId)?.title||"AMX Showcase"}</h2><div className="pod-invite-facts"><span><RoleIcon/>{invite.role}</span><span><CalendarClock/>{new Date(invite.expiresAt).toLocaleString()}</span><span><Users/>{places} places remaining</span><span><Mic2/>Live room media</span></div></div><aside><ShieldCheck/><h3>{signedIn?"Unlock your admission":"Member sign-in required"}</h3><p><b>Destination:</b> {invite.title} access lobby, room {invite.roomCode}. From there you can enter the main stage and available Pods.</p>{signedIn&&<label className="pod-zkode-field">ZKODE<input value={zkode} onChange={(event)=>setZkode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16))} autoComplete="one-time-code" inputMode="text" placeholder="ENTER ZKODE" maxLength={16}/></label>}<p>The QR and ZKODE are separate credentials. Paid passes are activated only after verified checkout fulfillment.</p><button className="button primary large full" disabled={busy||invite.status!=="active"||member.loading} onClick={accept}><DoorOpen/>{busy?"Unlocking showcase...":signedIn?"Unlock pass and enter lobby":"Sign in to unlock pass"}</button>{error&&<p className="invite-inline-error" role="alert">{error}</p>}</aside></section></div>;
}

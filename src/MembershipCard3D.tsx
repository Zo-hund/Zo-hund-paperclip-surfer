import { useEffect, useRef, useState, type PointerEvent } from "react";
import { BadgeCheck, ContactRound, Rotate3d, Share2, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import QRCode from "qrcode";

interface MembershipCard3DProps {
  memberName: string;
  memberId: string;
  organization: string;
  organizationType: string;
  color: string;
  level: string;
  xp: number;
  badges: number;
  proofScope: string;
  profilePath: string;
  avatarUrl?: string | null;
  onShare: () => void;
}

export function MembershipCard3D(props: MembershipCard3DProps) {
  const [flipped,setFlipped]=useState(false);
  const card=useRef<HTMLDivElement>(null);
  const qr=useRef<HTMLCanvasElement>(null);
  const profileUrl=typeof window === "undefined" ? props.profilePath : `${window.location.origin}${props.profilePath}`;

  useEffect(()=>{if(qr.current)void QRCode.toCanvas(qr.current,profileUrl,{width:118,margin:1,color:{dark:"#061117",light:"#f7fcff"}})},[profileUrl]);

  const move=(event:PointerEvent<HTMLDivElement>)=>{
    if(event.pointerType==="touch"||!card.current)return;
    const bounds=card.current.getBoundingClientRect();
    const x=(event.clientX-bounds.left)/bounds.width-.5;
    const y=(event.clientY-bounds.top)/bounds.height-.5;
    card.current.style.setProperty("--card-rx",`${(-y*9).toFixed(2)}deg`);
    card.current.style.setProperty("--card-ry",`${(x*12).toFixed(2)}deg`);
    card.current.style.setProperty("--card-glare-x",`${((x+.5)*100).toFixed(0)}%`);
    card.current.style.setProperty("--card-glare-y",`${((y+.5)*100).toFixed(0)}%`);
  };
  const reset=()=>{card.current?.style.setProperty("--card-rx","0deg");card.current?.style.setProperty("--card-ry","0deg")};

  return <section className="membership-card-module" style={{"--member-color":props.color} as React.CSSProperties}>
    <div className="membership-card-stage">
      <div ref={card} className={`membership-card-tilt ${flipped?"flipped":""}`} role="button" tabIndex={0} aria-label={flipped?"Show membership card front":"Show membership card verification"} onClick={()=>setFlipped((value)=>!value)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setFlipped((value)=>!value)}}} onPointerMove={move} onPointerLeave={reset}>
        <div className="membership-card-object">
          <article className="membership-card-face membership-card-front" aria-hidden={flipped}>
            <div className="membership-card-scan"/>
            <header><span className="membership-card-mark"><Sparkles/></span><div><b>AMX AIR HUBS</b><small>DIGITAL MEMBERSHIP</small></div><Wifi/></header>
            <div className={`membership-card-identity ${props.avatarUrl ? "has-avatar" : ""}`}>
              {props.avatarUrl && <img className="membership-card-avatar" src={props.avatarUrl} alt=""/>}
              <div><span>MEMBER</span><h2>{props.memberName}</h2><p>{props.organization} / {props.organizationType}</p></div>
            </div>
            <footer><div><small>MEMBER ID</small><code>{props.memberId}</code></div><div><small>LEVEL</small><b>{props.level}</b></div><BadgeCheck/></footer>
          </article>
          <article className="membership-card-face membership-card-back" aria-hidden={!flipped}>
            <div><span className="eyebrow">VERIFIED MEMBER</span><h3>{props.organization}</h3><p>Portable learning identity scoped to <b>{props.proofScope}</b>.</p><div className="membership-card-stats"><span><b>{props.xp}</b>XP</span><span><b>{props.badges}</b>BADGES</span></div></div>
            <canvas ref={qr} aria-label="QR code for member profile"/>
            <footer><ShieldCheck/><span>Tap or press Enter to return to the card face.</span></footer>
          </article>
        </div>
      </div>
    </div>
    <div className="membership-card-actions"><button className="button secondary" onClick={()=>setFlipped((value)=>!value)}><Rotate3d/>{flipped?"Show front":"Verify card"}</button><button className="button primary" onClick={props.onShare}><Share2/>Share card</button><a className="icon-button" href={props.profilePath} aria-label="Open member profile" title="Open member profile"><ContactRound/></a></div>
  </section>;
}

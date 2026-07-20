import { useMemo, useState } from "react";
import { Bot, Camera, Cast, CircleStop, Clapperboard, Columns3, Expand, MapPin, MonitorPlay, PanelsTopLeft, Radio, Sparkles, Users, Video } from "lucide-react";
import type { ProductionScreenId, ScreenLayoutMode, ScreenProgram, ScreenSourceId, ScreenTransitionStyle, ScreenWallFit } from "./NexusRoomScene";
import { screenWallCastHref } from "./screen-wall";

interface Props {
  roomCode: string;
  mode: ScreenLayoutMode;
  wallSource: ScreenSourceId;
  wallFit: ScreenWallFit;
  program: ScreenProgram;
  available: Partial<Record<ScreenSourceId, boolean>>;
  transitioning: boolean;
  onMode: (mode: ScreenLayoutMode) => void;
  onWallFit: (fit: ScreenWallFit) => void;
  onTakeWall: (source: ScreenSourceId, transition: ScreenTransitionStyle) => void;
  onTake: (targets: ProductionScreenId[], source: ScreenSourceId, transition: ScreenTransitionStyle) => void;
  onTakeLayout: (program: ScreenProgram, transition: ScreenTransitionStyle) => void;
}

interface PresentationConnectionLike { terminate?: () => void }
interface PresentationRequestLike { start: () => Promise<PresentationConnectionLike> }
type PresentationRequestConstructor = new (urls: string[]) => PresentationRequestLike;

const SCREENS: Array<{id:ProductionScreenId;label:string;short:string}> = [
  {id:"Screen_User",label:"Center screen",short:"CTR"},
  {id:"Screen_Agent_Left",label:"Left screen",short:"LFT"},
  {id:"Screen_Agent_Right",label:"Right screen",short:"RGT"},
];

const SOURCES: Array<{id:ScreenSourceId;label:string;short:string;icon:typeof Camera}> = [
  {id:"camera-1",label:"Pod camera 1",short:"CAM 1",icon:Camera},
  {id:"camera-2",label:"Pod camera 2",short:"CAM 2",icon:Users},
  {id:"camera-3",label:"Pod camera 3",short:"CAM 3",icon:Users},
  {id:"media",label:"Media deck",short:"MEDIA",icon:MonitorPlay},
  {id:"map",label:"Geo context",short:"MAP",icon:MapPin},
  {id:"runway",label:"Runway agent",short:"AGENT",icon:Bot},
  {id:"amx-air",label:"AMX AIR HUBS.CC",short:"AIR",icon:Sparkles},
  {id:"amx-labs",label:"AMX Labs",short:"LABS",icon:Clapperboard},
  {id:"black",label:"Black",short:"BLK",icon:CircleStop},
];

const LAYOUTS: Array<{id:string;label:string;program:ScreenProgram}> = [
  {id:"showcase",label:"Showcase",program:{Screen_User:"media",Screen_Agent_Left:"amx-labs",Screen_Agent_Right:"amx-air"}},
  {id:"collab",label:"Collab",program:{Screen_User:"camera-1",Screen_Agent_Left:"camera-2",Screen_Agent_Right:"camera-3"}},
  {id:"context",label:"Context",program:{Screen_User:"runway",Screen_Agent_Left:"media",Screen_Agent_Right:"map"}},
  {id:"brand",label:"Brand",program:{Screen_User:"amx-air",Screen_Agent_Left:"amx-labs",Screen_Agent_Right:"amx-air"}},
];

export function NexusProductionSwitcher({roomCode,mode,wallSource,wallFit,program,available,transitioning,onMode,onWallFit,onTakeWall,onTake,onTakeLayout}:Props) {
  const [target,setTarget]=useState<ProductionScreenId>("Screen_User");
  const [preview,setPreview]=useState<ScreenSourceId>("media");
  const [transition,setTransition]=useState<ScreenTransitionStyle>("amx-air");
  const [castState,setCastState]=useState("TV READY");
  const current=useMemo(()=>SOURCES.find((source)=>source.id===(mode==="wall"?wallSource:program[target])),[mode,program,target,wallSource]);
  const castHref=useMemo(()=>screenWallCastHref(roomCode),[roomCode]);
  const castWall=async()=>{
    const displayUrl=new URL(castHref,window.location.origin).href;
    const PresentationRequest=(window as Window & {PresentationRequest?:PresentationRequestConstructor}).PresentationRequest;
    if(PresentationRequest){
      try{setCastState("FINDING DISPLAY");await new PresentationRequest([displayUrl]).start();setCastState("CASTING LIVE");return}
      catch{setCastState("CAST CANCELLED");return}
    }
    window.open(displayUrl,"_blank","noopener,noreferrer");
    setCastState("DISPLAY OPENED");
  };
  const take=()=>mode==="wall"?onTakeWall(preview,transition):onTake([target],preview,transition);
  return <section className="nexus-production-switcher">
    <header><div><span className="eyebrow">SCREEN TRANSFORMER / {mode==="wall"?"1 WALL OUTPUT":"3 MESH OUTPUTS"}</span><h3>Screen control</h3></div><span className={`production-tally ${transitioning?"taking":""}`}><i/>{transitioning?"TAKING":"PROGRAM"}</span></header>
    <div className="screen-transformer-mode" role="tablist" aria-label="Screen layout mode"><button className={mode==="triple"?"active":""} onClick={()=>onMode("triple")}><Columns3/>Triple</button><button className={mode==="wall"?"active":""} onClick={()=>onMode("wall")}><PanelsTopLeft/>Wall</button></div>
    {mode==="triple"?<div className="production-bus-row">
      {SCREENS.map((screen)=><button key={screen.id} className={target===screen.id?"active":""} onClick={()=>setTarget(screen.id)} title={screen.label}><span>{screen.short}</span><b>{SOURCES.find((source)=>source.id===program[screen.id])?.short||"BLK"}</b><i/></button>)}
    </div>:<div className="production-wall-bus"><PanelsTopLeft/><span><small>ONE SCREEN WALL / FULL VIEW</small><b>{current?.label||"Black"}</b></span><i>3840 x 1080</i></div>}
    <div className="production-preview"><div><span>PROGRAM / {mode==="wall"?"WALL":SCREENS.find((screen)=>screen.id===target)?.short}</span><b>{current?.label}</b></div><Video/><div><span>PREVIEW</span><b>{SOURCES.find((source)=>source.id===preview)?.label}</b></div></div>
    <div className="production-source-grid">{SOURCES.map(({id,label,short,icon:Icon})=><button key={id} className={preview===id?"preview":""} disabled={available[id]===false} onClick={()=>setPreview(id)} title={label}><Icon/><span>{short}</span><i/></button>)}</div>
    <div className="production-transition-row"><div role="tablist" aria-label="Screen transition">{(["cut","dip","amx-air","amx-labs"] as ScreenTransitionStyle[]).map((style)=><button key={style} className={transition===style?"active":""} onClick={()=>setTransition(style)}>{style==="amx-air"?"AIR":style==="amx-labs"?"LABS":style}</button>)}</div><button className="production-take" disabled={transitioning} onClick={take}><Radio/>TAKE</button></div>
    {mode==="triple"?<div className="production-layouts"><span>TAKE ALL 3</span><div>{LAYOUTS.map((layout)=><button key={layout.id} disabled={transitioning} onClick={()=>onTakeLayout(layout.program,transition)}>{layout.label}</button>)}</div></div>:<div className="screen-wall-output"><div className="screen-wall-fit" role="tablist" aria-label="Screen wall framing"><button className={wallFit==="contain"?"active":""} onClick={()=>onWallFit("contain")}><Expand/>Full</button><button className={wallFit==="cover"?"active":""} onClick={()=>onWallFit("cover")}><PanelsTopLeft/>Fill</button></div><a href={castHref} target="_blank" rel="noreferrer" title="Open clean TV display"><MonitorPlay/>Display</a><button onClick={()=>void castWall()} title="Cast screen wall to a TV"><Cast/>TV Cast</button><small>{castState}</small></div>}
  </section>;
}

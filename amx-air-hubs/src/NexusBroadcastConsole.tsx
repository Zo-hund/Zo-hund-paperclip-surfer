import { ExternalLink, Mic2, Podcast, RadioTower, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { nexusStageHref, nexusViewerHref, type NexusBroadcastFormat } from "./nexus-broadcast";
import { StreamlabsControl } from "./StreamlabsControl";

export function NexusBroadcastConsole({ roomCode }: { roomCode: string }) {
  const [format, setFormat] = useState<NexusBroadcastFormat>("podcast");
  const stageHref = useMemo(() => nexusStageHref(roomCode, format), [format, roomCode]);
  const viewerHref = useMemo(() => nexusViewerHref(roomCode), [roomCode]);

  const rememberRoom = () => localStorage.setItem("amx_stage_room", roomCode);

  return <><section className="nexus-broadcast-console" data-broadcast-format={format}>
    <header><div><span className="eyebrow">ROOM TO STAGE</span><b>Live production output</b></div><span><i/>READY</span></header>
    <div className="nexus-broadcast-source"><RadioTower/><span><b>{roomCode}</b><small>LiveKit room / studio voice / camera / screen</small></span></div>
    <div className="nexus-broadcast-format" role="group" aria-label="Broadcast format">
      <button className={format === "show" ? "active" : ""} onClick={() => setFormat("show")}><Video/><span>LIVE EVENT</span></button>
      <button className={format === "podcast" ? "active" : ""} onClick={() => setFormat("podcast")}><Podcast/><span>PODCAST</span></button>
    </div>
    <div className="nexus-broadcast-actions">
      <a className="button primary" href={stageHref} target="_blank" rel="noreferrer" onClick={rememberRoom}><RadioTower/>OPEN STAGE OUTPUT</a>
      <a className="button secondary" href={viewerHref} target="_blank" rel="noreferrer"><ExternalLink/>PUBLIC VIEWER</a>
    </div>
    <div className="nexus-broadcast-health"><span><Mic2/>48 KHZ VOICE</span><span><Video/>1080 READY</span><span><RadioTower/>RTMP EGRESS</span></div>
  </section><StreamlabsControl room={roomCode}/></>;
}

export interface BoardIssue { id:string; title:string; description:string; status:string; priority:string; visibility:"public"|"private"; source:string; updated_at:string }
export interface SimLiveRun { id:string; mission_id?:string; room_code?:string; mode:"simulation"|"live"; status:string; visibility:"public"|"private"; agent_id?:string; summary:string; updated_at:string }
export interface BoardFeed { issues:BoardIssue[]; runs:SimLiveRun[]; persisted:boolean; visibility:"public"|"tenant" }

export async function loadBoardFeed(tenantId:string, publicOnly=false, signal?:AbortSignal):Promise<BoardFeed> {
  const path=publicOnly?"/api/board/public/feed":"/api/board/feed";
  const response=await fetch(`${path}?tenantId=${encodeURIComponent(tenantId)}`,{credentials:"include",cache:"no-store",signal});
  if(!response.ok) throw new Error((await response.json().catch(()=>null))?.error||"Board feed is unavailable");
  return response.json();
}

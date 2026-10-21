import { useEffect, useRef, useState } from "react";
import { calendarApi } from "@/api/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function parseEventInstant(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) throw new Error("Use a complete date/time with seconds and UTC offset, for example 2026-10-21T09:00:00-04:00.");
  const [,year,month,day,hour,minute,second,offset] = m;
  const days = new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
  const oh = offset === "Z" ? 0 : Number(offset.slice(1,3));
  const om = offset === "Z" ? 0 : Number(offset.slice(4,6));
  if (Number(month)<1 || Number(month)>12 || Number(day)<1 || Number(day)>days || Number(hour)>23 || Number(minute)>59 || Number(second)>59 || oh>14 || om>59 || (oh===14 && om!==0) || !Number.isFinite(Date.parse(value))) throw new Error("Use a valid calendar date, time and UTC offset.");
  return new Date(value).toISOString();
}

export function localEventInstant(value: string, timeZone: "America/New_York" | "UTC"): string {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if(!match) throw new Error("Choose a start and end date and time.");
  const [year,month,day,hour,minute]=match.slice(1).map(Number);
  if(year<2000 || year>2100 || month<1 || month>12 || day<1 || day>new Date(Date.UTC(year,month,0)).getUTCDate() || hour>23 || minute>59) throw new Error("Choose a valid calendar date and time.");
  const expected=[year,month,day,hour,minute];
  const formatter=new Intl.DateTimeFormat("en-US",{timeZone,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const candidates=(timeZone==="UTC"?[0]:[4,5]).map(offset=>new Date(Date.UTC(year,month-1,day,hour+offset,minute))).filter(date=>{
    const parts=formatter.formatToParts(date);
    return ["year","month","day","hour","minute"].every((key,i)=>Number(parts.find(p=>p.type===key)?.value)===expected[i]);
  });
  if(!candidates.length) throw new Error("That time does not exist during the clock change. Choose another time or use UTC.");
  if(candidates.length>1) throw new Error("That time occurs twice during the clock change. Choose UTC to select the exact time.");
  return candidates[0]!.toISOString();
}

export function CalendarCreateDialog({ companyId, onClose, onSaved }: {
  companyId: string; onClose: () => void; onSaved: () => void;
}) {
  const [title,setTitle] = useState("");
  const [start,setStart] = useState("");
  const [end,setEnd] = useState("");
  const [timeZone,setTimeZone] = useState<"America/New_York" | "UTC">("America/New_York");
  const [error,setError] = useState("");
  const [pending,setPending] = useState(false);
  const [savedId,setSavedId] = useState<string | null>(null);
  const [uncertain,setUncertain] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(()=>{ active.current=true; return ()=>{active.current=false;}; },[]);
  // The parent keys this component by company, so switching company removes it.
  // Cleanup prevents an old request from closing or refreshing the new company UI.
  const cancel = () => { active.current = false; onClose(); };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || uncertain) return;
    let startDate: string, endDate: string;
    try {
      if (!title.trim()) throw new Error("Enter an event title.");
      startDate = localEventInstant(start,timeZone); endDate = localEventInstant(end,timeZone);
      if (Date.parse(endDate)<=Date.parse(startDate)) throw new Error("End time must follow start time.");
    } catch (e) { setError(e instanceof Error ? e.message : "Check the event details."); return; }
    lock.current = true; setPending(true); setError("");
    let createdId = savedId;
    try {
      if (!createdId) {
        // The inspected server supports these fields. Keep events draft by default.
        const created = await calendarApi.createEvent(companyId,{title:title.trim(),startDate,endDate,eventType:"general",isPublished:false});
        const id = (created as {id?:unknown})?.id;
        if (typeof id !== "string" || !id) {
          if(active.current) setUncertain(true);
          throw new Error("Save result is uncertain. Close and refresh the calendar to reconcile before creating another event.");
        }
        createdId = id; if (active.current) setSavedId(id);
      }
      const result = await calendarApi.getCalendar(companyId,{since:startDate,until:endDate});
      if (!result.events.some(row=>row.id===createdId)) throw new Error("Saved event has not appeared in the calendar yet. Check again; do not create another copy.");
      if (active.current) { onSaved(); onClose(); }
    } catch (e) {
      if (active.current) {
        const status=(e as {status?:number})?.status;
        if(!createdId && !(typeof status==='number' && status>=400 && status<500 && status!==408)) {
          setUncertain(true);
          setError("Save result is uncertain. Close and refresh the calendar to reconcile before creating another event.");
        } else setError(status===403 ? "You do not have permission to save events for this company." : status===401 ? "Sign in again to save this event." : e instanceof Error ? e.message : "Event could not be saved. Check your connection.");
      }
    } finally {
      lock.current=false; if (active.current) setPending(false);
    }
  }

  return <Dialog open onOpenChange={open=>{if(!open && !pending) cancel();}}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!pending}>
      <DialogHeader><DialogTitle>New Event</DialogTitle><DialogDescription>Save a draft event. Times in {timeZone==="America/New_York" ? "Eastern Time" : "UTC"}.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm">Title<input aria-label="Event title" value={title} onChange={e=>setTitle(e.target.value)} disabled={pending || !!savedId} maxLength={300} className="rounded border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">Time zone<select aria-label="Event time zone" value={timeZone} onChange={e=>setTimeZone(e.target.value as "America/New_York" | "UTC")} disabled={pending || !!savedId} className="rounded border px-3 py-2"><option value="America/New_York">Eastern Time (New York)</option><option value="UTC">UTC</option></select></label>
        <label className="grid gap-1 text-sm">Start<input type="datetime-local" aria-label="Event start" value={start} onChange={e=>setStart(e.target.value)} disabled={pending || !!savedId} className="rounded border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm">End<input type="datetime-local" aria-label="Event end" value={end} onChange={e=>setEnd(e.target.value)} disabled={pending || !!savedId} className="rounded border px-3 py-2" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={cancel} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || uncertain}>{pending ? "Saving / checking..." : uncertain ? "Reconciliation required" : savedId ? "Check saved event" : "Save draft event"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

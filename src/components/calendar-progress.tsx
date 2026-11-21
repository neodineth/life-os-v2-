"use client";
import { useState } from "react";
import { calendarStatusLabels, type CalendarStatus, type CalendarOccurrence, type CalendarCommand } from "@/lib/calendar";
import { progressLinks } from "@/lib/progress-links";
export function CalendarProgress({occurrence, ready, busy, onSave, onClose}: {occurrence:CalendarOccurrence;ready:boolean;busy:boolean;onSave:(command:CalendarCommand)=>Promise<boolean>;onClose:()=>void}) {
  const [status,setStatus]=useState<CalendarStatus>(occurrence.done?"completed":occurrence.status||"pending");
  const [notes,setNotes]=useState(occurrence.notes||"");
  return <form className="calendar-progress-form" onSubmit={async event=>{event.preventDefault();if(!ready||busy)return;if(await onSave({action:"progress",seriesId:occurrence.seriesId,date:occurrence.date,status,notes,expectedVersion:occurrence.completionVersion??null,expectedSeriesVersion:occurrence.version}))onClose();}}>
    <h3>Task outcome</h3><p>Status and progress notes apply only to this calendar occurrence.</p>
    {!ready && <p role="alert">Run LifeOS-V2-Calendar-Progress.sql in Supabase to enable status and progress notes.</p>}
    <fieldset disabled={!ready||busy}><label>Status<select autoFocus value={status} onChange={e=>setStatus(e.target.value as CalendarStatus)}>{Object.entries(calendarStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Progress notes<textarea value={notes} maxLength={10000} rows={5} placeholder="What did you finish? Add links, results, or what remains to do." onChange={e=>setNotes(e.target.value)}/></label>
    {notes && <div className="calendar-progress-preview">{progressLinks(notes).map((part,index)=>part.href?<a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>:<span key={index}>{part.text}</span>)}</div>}
    <button className="primary" type="submit">{busy?"Saving...":"Save status and notes"}</button></fieldset>
  </form>;
}

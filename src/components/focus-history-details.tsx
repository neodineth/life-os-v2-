"use client";
import { GameDialog } from "./game-dialog";
import { focusByDay, durationLabel, breakLabel, type FocusSession, type FocusTask } from "@/lib/focus";
export function FocusDayDetails({ day, sessions, activeId, timeZone, onClose }: { day: string; sessions: FocusSession[]; activeId?: string; timeZone?: string; onClose: () => void }) {
  const records = sessions.filter(session => focusByDay([session], timeZone)[day]);
  return <GameDialog title={`Focus history · ${day}`} titleId="focus-day-title" onClose={onClose} wide><div className="focus-selection"><p>Recorded history with account cloud sync and a browser backup. Short/long labels describe absence duration, not the reason for leaving.</p>{records.map(session => {
    const total = focusByDay([session], timeZone)[day];
    return <article className="focus-history-record" key={session.id}><h3>{session.tasks.map(task => task.title).join(" · ")}</h3><p>{new Date(session.startedAt).toLocaleString(undefined, { timeZone })}{session.id === activeId ? " · Live session" : session.interrupted ? " · Saved checkpoint (interrupted session)" : ""}</p>{session.plannedOccurrenceId && <p>Started from your planned schedule.</p>}<p>Focus {durationLabel(total.focus)} · Away {durationLabel(total.away)} · Untracked {durationLabel(total.untracked)} · Paused {durationLabel(total.paused)}</p><FocusTaskContext tasks={session.tasks}/><ul>{session.segments.filter(segment => segment.state === "away" && focusByDay([{ ...session, segments: [segment] }], timeZone)[day]).map((segment, index) => <li key={index}>{breakLabel(segment.end - segment.start)} · {durationLabel(segment.end - segment.start)} · {new Date(segment.start).toLocaleString(undefined, { timeZone })}</li>)}</ul></article>;
  })}<button className="secondary" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "lifeos-focus-history.json"; link.click(); URL.revokeObjectURL(url); }}>Export focus history</button></div></GameDialog>;
}

function FocusTaskContext({ tasks }: { tasks: FocusTask[] }) {
  const detailed = tasks.filter(task => task.levels?.length || task.note);
  if (!detailed.length) return null;
  return <ul className="focus-task-context">{detailed.map(task => <li key={task.id}><strong>{task.title}</strong>
    {!!task.levels?.length && <p>Levels: {task.levels.map(level => `${level.number}. ${level.title}`).join(" · ")}</p>}
    {task.note && <p className="focus-note-text">{task.note}</p>}
  </li>)}</ul>;
}

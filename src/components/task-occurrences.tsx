"use client";

import { useState } from "react";
import { dayOfWeek, expandCalendar, shiftDay, zonedDay, zonedInstant } from "@/lib/calendar";
import { useCalendar } from "@/hooks/use-calendar";
import type { Task } from "@/lib/tasks";

export function TaskOccurrences({ userId, task, busy, onToggle }: { userId: string; task: Task; busy: boolean; onToggle: () => void }) {
  const [offset, setOffset] = useState(0);
  const [now] = useState(() => Date.now());
  const cloud = useCalendar(userId, now + (offset * 7 - 8) * 86400000, now + (offset * 7 + 9) * 86400000);
  const today = zonedDay(now, cloud.timeZone), first = shiftDay(today, -dayOfWeek(today) + offset * 7), last = shiftDay(first, 7);
  const occurrences = expandCalendar(cloud, zonedInstant(first, "00:00", cloud.timeZone), zonedInstant(last, "00:00", cloud.timeZone)).filter(occurrence => occurrence.task.id === task.id);
  const formatter = new Intl.DateTimeFormat("en", { timeZone: cloud.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return <section className="task-occurrences"><h3>Scheduled sessions</h3><p className="focus-optional-hint">Done applies to one session. Levels are shared across all sessions; completing a session does not add focus time or XP.</p>
    <div className="occurrence-week"><button className="secondary" type="button" onClick={() => setOffset(offset - 1)} aria-label="Previous session week">←</button><span>{first} – {shiftDay(last, -1)}</span><button className="secondary" type="button" onClick={() => setOffset(offset + 1)} aria-label="Next session week">→</button></div>
    {cloud.error && <p className="focus-error" role="alert">{cloud.error}<button type="button" className="text-button" onClick={() => void (cloud.retry ? cloud.retry() : cloud.load())}>Retry sessions</button></p>}
    {!cloud.ready ? <p>Loading sessions…</p> : !cloud.taskSchedulesReady ? <p>Install the task-schedules migration to complete individual sessions.</p> : occurrences.length ? <ul>{occurrences.map(occurrence => <li key={occurrence.id}><span>{formatter.format(occurrence.start)}<small>to {formatter.format(occurrence.end)}</small></span><button className="secondary" type="button" disabled={busy || cloud.busy} aria-pressed={!!occurrence.done} onClick={() => void cloud.commit({ action: "complete", seriesId: occurrence.seriesId, date: occurrence.date, done: !occurrence.done, expectedVersion: occurrence.completionVersion ?? null })}>{occurrence.done ? "✓ Undo done" : "Done"}</button></li>)}</ul> : <p className="focus-optional-hint">No sessions this week. Edit the task to add time slots.</p>}
    <button className="secondary" type="button" disabled={busy || cloud.busy} onClick={onToggle}>{task.done ? "Reopen task" : "End task"}</button><p className="focus-optional-hint">{task.done ? "Reopening keeps previous sessions. Add new time slots to resume scheduling." : "End task finishes this task and stops future task schedules without resetting levels."}</p>
  </section>;
}

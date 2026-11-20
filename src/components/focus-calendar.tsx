"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { calendarSelection } from "@/lib/calendar-selection";
import { useCalendar } from "@/hooks/use-calendar";
import { arrangeOverlaps, dayOfWeek, dragOccurrence, expandCalendar, minuteOfDay, shiftDay, splitAtMidnights, zonedDay, zonedInstant, type CalendarOccurrence } from "@/lib/calendar";
import { durationLabel, focusByDay, type FocusSession, type FocusTask } from "@/lib/focus";
import type { Task } from "@/lib/tasks";
import { CalendarPlanDialog, type PlanEditing } from "./calendar-plan-dialog";
import { FocusDayDetails } from "./focus-history-details";

const workspaces = ["University 01", "University 02", "Startup 01", "Startup 02", "Personal Growth"];
const colors = ["#99ffd1", "#58d4f5", "#f7be63", "#ed8fc1", "#77e9b4"];
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PX_PER_MINUTE = 0.8;
type View = "week" | "day" | "month";
type Drag = { pointerId: number; occurrence: CalendarOccurrence; mode: "move" | "start" | "end"; x: number; y: number; scrollTop: number; day: string; moved: boolean; proposed: CalendarOccurrence };
type PlanSlice = { value: CalendarOccurrence; start: number; end: number; day: string };
type ActualSlice = { value: { session: FocusSession; state: string }; start: number; end: number; day: string };
const monthShift = (day: string, amount: number) => { const date = new Date(day + "T12:00:00Z"); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 10); };

export function FocusCalendar({ userId, tasks, sessions, timeZone, activeId, search = "", onOpenTask, onFocus, onDialogChange }: {
  userId: string; tasks: Task[]; sessions: FocusSession[]; timeZone: string; activeId?: string; search?: string;
  onOpenTask: (id: string) => void; onFocus?: (task: FocusTask, occurrenceId: string) => void; onDialogChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => zonedDay(Date.now(), timeZone));
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<PlanEditing | null>(null);
  const [actual, setActual] = useState<{ day: string; sessionId?: string } | null>(null);
  const [ghost, setGhost] = useState<CalendarOccurrence | null>(null);
  const [selection, setSelection] = useState<{ day: string; start: number; end: number } | null>(null);
  const selecting = useRef<{ pointerId: number; day: string; anchor: number } | null>(null);
  const root = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);
  useEffect(() => { if (window.matchMedia("(max-width: 760px)").matches) queueMicrotask(() => setView("day")); }, []);
  useEffect(() => {
    const refresh = () => setClockNow(Date.now());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => { onDialogChange(!!editing || !!actual); return () => onDialogChange(false); }, [editing, actual, onDialogChange]);
  const first = view === "month" ? shiftDay(anchor.slice(0, 7) + "-01", -dayOfWeek(anchor.slice(0, 7) + "-01")) : view === "week" ? shiftDay(anchor, -dayOfWeek(anchor)) : anchor;
  const count = view === "month" ? 42 : view === "week" ? 7 : 1;
  const days = Array.from({ length: count }, (_, index) => shiftDay(first, index));
  const cloud = useCalendar(userId, Date.parse(first + "T00:00:00Z") - 86400000, Date.parse(shiftDay(first, count) + "T00:00:00Z") + 86400000);
  const zone = cloud.timeZone;
  const from = zonedInstant(first, "00:00", zone), to = zonedInstant(shiftDay(first, count), "00:00", zone);
  const today = zonedDay(clockNow, zone);
  const formatter = new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" });
  const monthTitle = new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(anchor + "T12:00:00Z"));
  const occurrences = expandCalendar(cloud, from, to);
  const plans = occurrences.map(item => ghost?.id === item.id ? ghost : item);
  const term = search.trim().toLowerCase();
  const shownTasks = tasks.filter(task => task.title.toLowerCase().includes(term));
  const planSlices: PlanSlice[] = plans.filter(item => item.task.title.toLowerCase().includes(term)).flatMap(item => splitAtMidnights(item, Math.max(item.start, from), Math.min(item.end, to), zone));
  const actualSlices: ActualSlice[] = sessions.filter(session => session.tasks.some(task => task.title.toLowerCase().includes(term))).flatMap(session => session.segments.flatMap(segment => splitAtMidnights({ session, state: segment.state }, Math.max(segment.start, from), Math.min(segment.end, to), zone)));
  const totals = focusByDay(sessions, zone);
  useEffect(() => { if (scroll.current && view !== "month") scroll.current.scrollTop = 7 * 60 * PX_PER_MINUTE; }, [view, first]);
  const navigate = (amount: number) => setAnchor(view === "month" ? monthShift(anchor, amount) : shiftDay(anchor, amount * count));
  const openPlan = (occurrence: CalendarOccurrence) => { cloud.clearError(); onDialogChange(true); setEditing({ start: occurrence.start, end: occurrence.end, occurrence, series: cloud.blocks.find(block => block.id === occurrence.seriesId) }); };
  const openActual = (day: string, sessionId?: string) => { onDialogChange(true); setActual({ day, sessionId }); };
  const newPlan = (day: string, minute = 540, endMinute = minute + 30) => {
    const at = (value: number) => zonedInstant(shiftDay(day, Math.floor(value / 1440)), `${String(Math.floor(value % 1440 / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`, zone);
    cloud.clearError(); onDialogChange(true); setEditing({ start: at(minute), end: at(endMinute), standalone: true });
  };
  const cancelSelection = () => { selecting.current = null; setSelection(null); };
  const selectStart = (event: PointerEvent<HTMLButtonElement>, day: string) => {
    if (event.pointerType === "touch" || event.button !== 0 || !cloud.ready || cloud.busy) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const anchor = (event.clientY - event.currentTarget.getBoundingClientRect().top) / PX_PER_MINUTE;
    selecting.current = { pointerId: event.pointerId, day, anchor };
    setSelection({ day, ...calendarSelection(anchor, anchor) });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const selectMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = selecting.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const minute = (event.clientY - event.currentTarget.getBoundingClientRect().top) / PX_PER_MINUTE;
    setSelection({ day: current.day, ...calendarSelection(current.anchor, minute) });
  };
  const selectEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const current = selecting.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect(), bounds = scroll.current?.getBoundingClientRect();
    const range = calendarSelection(current.anchor, (event.clientY - rect.top) / PX_PER_MINUTE);
    cancelSelection();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.clientX < rect.left || event.clientX > rect.right || (bounds && (event.clientY < bounds.top || event.clientY > bounds.bottom))) return;
    newPlan(current.day, range.start, range.end);
  };
  const beginDrag = (event: PointerEvent<HTMLElement>, occurrence: CalendarOccurrence, mode: Drag["mode"], day: string) => {
    if (occurrence.done) { if (mode === "move") openPlan(occurrence); return; }
    if (!cloud.ready || cloud.busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    drag.current = { pointerId: event.pointerId, occurrence, mode, x: event.clientX, y: event.clientY, scrollTop: scroll.current?.scrollTop || 0, day, moved: false, proposed: occurrence };
    root.current?.setPointerCapture(event.pointerId);
  };
  const cancelDrag = () => { const current = drag.current; drag.current = null; setGhost(null); if (current && root.current?.hasPointerCapture(current.pointerId)) root.current.releasePointerCapture(current.pointerId); };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - current.y) + Math.abs(event.clientX - current.x) < 5 && !current.moved) return;
    current.moved = true;
    let day = current.day;
    for (const element of root.current?.querySelectorAll<HTMLElement>("[data-grid-day]") || []) { const rect = element.getBoundingClientRect(); if (event.clientX >= rect.left && event.clientX < rect.right) { day = element.dataset.gridDay!; break; } }
    const dayDelta = (Date.parse(day) - Date.parse(current.day)) / 86400000;
    const delta = dayDelta * 1440 + Math.round((event.clientY - current.y + (scroll.current?.scrollTop || 0) - current.scrollTop) / PX_PER_MINUTE / 15) * 15;
    current.proposed = dragOccurrence(current.occurrence, current.mode, delta, zone); setGhost(current.proposed);
  };
  const endDrag = async (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null; if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
    const bounds = scroll.current?.getBoundingClientRect();
    if (bounds && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) { setGhost(null); return; }
    if (!current.moved) { setGhost(null); if (current.mode === "move") openPlan(current.occurrence); return; }
    const item = current.proposed;
    const series = cloud.blocks.find(block => block.id === item.seriesId);
    if (item.repeating) await cloud.commit({ action: "exception", expectedVersion: current.occurrence.version, exception: { seriesId: item.seriesId, date: item.date, cancelled: false, override: { task: item.task, workspace: item.workspace, start: item.start, end: item.end } } });
    else if (series) await cloud.commit({ action: "save", expectedVersion: current.occurrence.version, block: { ...series, start: item.start, end: item.end } });
    setGhost(null);
  };
  const eventStyle = (slice: { start: number; end: number; day: string; column: number; columns: number }, workspace: string): CSSProperties => ({
    top: minuteOfDay(slice.start, zone) * PX_PER_MINUTE,
    height: Math.max(5, ((zonedDay(slice.end, zone) !== slice.day ? 1440 : minuteOfDay(slice.end, zone)) - minuteOfDay(slice.start, zone)) * PX_PER_MINUTE),
    left: `calc(${slice.column * 100 / slice.columns}% + 2px)`, width: `calc(${100 / slice.columns}% - 4px)`, "--event-color": colors[workspaces.indexOf(workspace)] || colors[0],
  } as CSSProperties);
  return <div className="focus-calendar" ref={root} onPointerMove={moveDrag} onPointerUp={event => void endDrag(event)} onPointerCancel={cancelDrag} onLostPointerCapture={() => { if (drag.current) cancelDrag(); }} onKeyDown={event => { if (event.key === "Escape" && (drag.current || selecting.current)) { event.preventDefault(); event.stopPropagation(); cancelDrag(); cancelSelection(); } }}>
    <div className="calendar-controls"><div><h2>{view === "month" ? monthTitle : view === "day" ? anchor : `${first} – ${days.at(-1)}`}</h2><span className="calendar-zone">{zone}</span></div>
      <div className="calendar-navigation"><button className="secondary" onClick={() => setAnchor(today)}>Today</button><button className="icon-button" aria-label="Previous calendar period" onClick={() => navigate(-1)}><ChevronLeft size={19}/></button><button className="icon-button" aria-label="Next calendar period" onClick={() => navigate(1)}><ChevronRight size={19}/></button></div>
      <div className="calendar-view-tabs" aria-label="Calendar view">{(["day", "week", "month"] as const).map(value => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <button className="primary" disabled={!cloud.ready || cloud.busy} onClick={() => newPlan(anchor)}><Plus size={15}/>Plan task</button>
    </div>
    <div className="calendar-legend"><span>Plan · task workspace colors</span><span className="actual-focus">Focus</span><span className="actual-away">Away</span><span className="actual-paused">Paused</span><span className="actual-untracked">Untracked</span><span>Drag empty Plan slots to add a calendar-only task. Drag a block to move it; drag its edges to resize. Repeats change this occurrence.</span></div>
    {cloud.error && <div className="notice" role="alert">{cloud.error}<button disabled={cloud.busy} onClick={() => void (cloud.retry ? cloud.retry() : cloud.load())}>Retry</button></div>}
    {cloud.busy && <p className="sync-status" role="status">Saving plan…</p>}
    {!cloud.ready && !cloud.error && <p className="sync-status">Loading calendar…</p>}
    {view === "month" ? <div className="calendar month-calendar">{dayNames.map(day => <div className="day-label" key={day}>{day}</div>)}{days.map(day => {
      const scheduled = planSlices.filter(item => item.day === day);
      return <div key={day} className={`calendar-day ${day === today ? "current" : ""} ${day.slice(0, 7) !== anchor.slice(0, 7) ? "outside-month" : ""}`}>
        <button className="calendar-date-open" aria-label={`Open day ${day}`} onClick={() => { setAnchor(day); setView("day"); }}>{Number(day.slice(-2))}</button>
        {scheduled.slice(0, 3).map(item => <button className="month-plan" key={item.value.id} style={{ borderColor: colors[workspaces.indexOf(item.value.workspace)] || colors[0] }} onClick={() => openPlan(item.value)}>{item.value.done ? "✓ " : ""}{formatter.format(item.value.start)} · {item.value.task.title}</button>)}
        {scheduled.length > 3 && <button onClick={() => { setAnchor(day); setView("day"); }}>+{scheduled.length - 3} more plans</button>}
        {totals[day] && <button className="calendar-focus-summary" onClick={() => openActual(day)}><span>Focus {durationLabel(totals[day].focus)}</span><span>Away {durationLabel(totals[day].away)}</span></button>}
        {shownTasks.filter(task => task.due === day && !task.done).map(task => <button key={task.id} onClick={() => onOpenTask(task.id)} style={{ borderColor: colors[workspaces.indexOf(task.workspace)] }}>Due · {task.title}</button>)}
      </div>;
    })}</div> : <div className="calendar-time-scroll" ref={scroll}><div className="calendar-time-grid" style={{ "--day-count": count } as CSSProperties}>
      <div className="calendar-time-head"><div className="calendar-time-corner">All day</div>{days.map(day => <div key={day} className={`calendar-column-heading ${day === today ? "current" : ""}`}><button onClick={() => { setAnchor(day); setView("day"); }}>{dayNames[dayOfWeek(day)]} <strong>{Number(day.slice(-2))}</strong></button><div className="calendar-deadlines">{shownTasks.filter(task => task.due === day && !task.done).map(task => <button key={task.id} onClick={() => onOpenTask(task.id)}>Due · {task.title}</button>)}</div><small>Focus {durationLabel(totals[day]?.focus || 0)}</small><div className="calendar-lane-headings"><span>Plan</span><span>Actual</span></div></div>)}</div>
      <div className="calendar-time-body"><div className="calendar-hour-labels">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * 60 * PX_PER_MINUTE }}>{hour % 12 || 12}{hour < 12 ? " AM" : " PM"}</span>)}</div>
        {days.map(day => <div key={day} data-grid-day={day} className={`calendar-day-lanes ${day === today ? "current" : ""}`}>
          {day === today && <div className="calendar-now-line" style={{ top: minuteOfDay(clockNow, zone) * PX_PER_MINUTE }} role="img" aria-label={`Current time: ${formatter.format(clockNow)} (${zone})`}><span className="calendar-now-dot"/><span className="calendar-now-label">{formatter.format(clockNow)}</span></div>}
          <div className="calendar-plan-lane" aria-label={`Planned time for ${day}`}><button className="calendar-add-slot" disabled={!cloud.ready || cloud.busy} aria-label={`Add calendar task on ${day}; press Enter to choose times`} onPointerDown={event => selectStart(event, day)} onPointerMove={selectMove} onPointerUp={selectEnd} onPointerCancel={cancelSelection} onLostPointerCapture={cancelSelection} onClick={event => { if (event.detail === 0) newPlan(day); else if ((event.nativeEvent as globalThis.PointerEvent).pointerType === "touch") { const minute = Math.max(0, Math.min(1410, Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / PX_PER_MINUTE / 30) * 30)); newPlan(day, minute); } }}/>
            {selection?.day === day && <div className="calendar-range-selection" style={{ top: selection.start * PX_PER_MINUTE, height: (selection.end - selection.start) * PX_PER_MINUTE }}><span>{String(Math.floor(selection.start / 60)).padStart(2, "0")}:{String(selection.start % 60).padStart(2, "0")} ? {String(Math.floor(selection.end / 60)).padStart(2, "0")}:{String(selection.end % 60).padStart(2, "0")}</span></div>}
            {arrangeOverlaps(planSlices.filter(item => item.day === day)).map(item => <div key={item.value.id} className={`calendar-event planned-event ${item.value.done ? "calendar-occurrence-done" : ""} ${ghost?.id === item.value.id ? "calendar-event-pending" : ""}`} style={eventStyle(item, item.value.workspace)}>
              <button className="calendar-resize calendar-resize-start" aria-label={`Resize start of ${item.value.task.title}`} disabled={cloud.busy} onPointerDown={event => beginDrag(event, item.value, "start", day)} onClick={event => { if (event.detail === 0) openPlan(item.value); }}/>
              <button className="calendar-event-open" aria-label={`Planned ${item.value.task.title}, ${formatter.format(item.value.start)} to ${formatter.format(item.value.end)}${item.value.done ? ", completed" : ""}`} title={`${item.value.task.title}\n${formatter.format(item.value.start)} – ${formatter.format(item.value.end)}${item.value.task.note ? `\n${item.value.task.note}` : ""}`} disabled={cloud.busy} onPointerDown={event => beginDrag(event, item.value, "move", day)} onClick={event => { if (event.detail === 0) openPlan(item.value); }}><strong>{item.value.done ? "✓ " : ""}{item.value.task.title}</strong><small>{formatter.format(item.value.start)} – {formatter.format(item.value.end)}</small>{item.value.repeating && <span className="calendar-repeats">↻</span>}</button>
              <button className="calendar-resize calendar-resize-end" aria-label={`Resize end of ${item.value.task.title}`} disabled={cloud.busy} onPointerDown={event => beginDrag(event, item.value, "end", day)} onClick={event => { if (event.detail === 0) openPlan(item.value); }}/>
            </div>)}
          </div>
          <div className="calendar-actual-lane" aria-label={`Recorded time for ${day}`}>{arrangeOverlaps(actualSlices.filter(item => item.day === day)).map(item => <button key={`${item.value.session.id}:${item.start}`} className={`calendar-event actual-event actual-${item.value.state}`} style={eventStyle(item, "")} aria-label={`Recorded ${item.value.state}: ${item.value.session.tasks.map(task => task.title).join(", ")}, ${formatter.format(item.start)} to ${formatter.format(item.end)}`} title={`${item.value.state} · ${item.value.session.tasks.map(task => task.title).join(" · ")}\n${formatter.format(item.start)} – ${formatter.format(item.end)}`} onClick={() => openActual(day, item.value.session.id)}><strong>{item.value.state === "focus" ? item.value.session.tasks.map(task => task.title).join(" · ") : item.value.state[0].toUpperCase() + item.value.state.slice(1)}</strong><small>{formatter.format(item.start)} – {formatter.format(item.end)}</small></button>)}</div>
        </div>)}
      </div>
    </div></div>}
    {editing && <CalendarPlanDialog editing={editing} tasks={tasks} timeZone={zone} busy={cloud.busy} error={cloud.error} activeFocus={!!activeId} standaloneReady={!!cloud.standaloneReady} completionReady={!!cloud.taskSchedulesReady} onSave={cloud.commit} onClose={() => setEditing(null)} onFocus={onFocus}/>}
    {actual && <FocusDayDetails day={actual.day} sessions={actual.sessionId ? sessions.filter(session => session.id === actual.sessionId) : sessions} timeZone={zone} activeId={activeId} onClose={() => setActual(null)}/>}
  </div>;
}

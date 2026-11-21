"use client";

import { useState } from "react";
import { CalendarProgress } from "./calendar-progress";
import { GameDialog } from "./game-dialog";
import { FocusTaskFields, type FocusDraft } from "./focus-task-fields";
import { focusTaskFromTask, type FocusTask } from "@/lib/focus";
import { calendarDateSchema, dayOfWeek, plannedBlockSchema, zonedDay, zonedInstant, zonedTime, type CalendarCommand, type CalendarOccurrence, type PlannedBlock } from "@/lib/calendar";
import type { Task } from "@/lib/tasks";

export type PlanEditing = { start: number; end: number; standalone?: boolean; occurrence?: CalendarOccurrence; series?: PlannedBlock };
type Draft = { title: string; taskId: string; startDay: string; startTime: string; endDay: string; endTime: string; focus: FocusDraft; frequency: "none" | "daily" | "weekly"; weekdays: number[]; until: string };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarPlanDialog({ editing, tasks, timeZone, busy, error, activeFocus, completionReady = false, standaloneReady = false, progressReady = false, onSave, onClose, onFocus }: {
  completionReady?: boolean; standaloneReady?: boolean; progressReady?: boolean;
  editing: PlanEditing; tasks: Task[]; timeZone: string; busy: boolean; error: string; activeFocus: boolean;
  onSave: (command: CalendarCommand) => Promise<boolean>; onClose: () => void;
  onFocus?: (task: FocusTask, occurrenceId: string) => void;
}) {
  const occurrence = editing.occurrence, series = editing.series;
  const standalone = editing.standalone || series?.origin === "calendar" || occurrence?.workspace === "Calendar";
  const zone = series?.timeZone || timeZone;
  const makeDraft = (whole: boolean): Draft => {
    const source = whole && series ? series : occurrence;
    const start = source?.start ?? editing.start, end = source?.end ?? editing.end;
    return { title: source?.task.title || "", taskId: source?.task.id || tasks.find(task => !task.done)?.id || "", startDay: zonedDay(start, zone), startTime: zonedTime(start, zone), endDay: zonedDay(end, zone), endTime: zonedTime(end, zone),
      focus: { levels: source?.task.levels?.map(level => level.number) || [], note: source?.task.note || "" },
      frequency: series?.repeat.frequency || "none", weekdays: series?.repeat.weekdays.length ? series.repeat.weekdays : [dayOfWeek(zonedDay(start, zone))], until: series?.repeat.until || "" };
  };
  const [scope, setScope] = useState<"occurrence" | "series">(occurrence?.repeating ? "occurrence" : "series");
  const [draft, setDraft] = useState<Draft>(() => makeDraft(!occurrence?.repeating));
  const [id] = useState(() => series?.id || crypto.randomUUID());
  const [deleting, setDeleting] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const [validation, setValidation] = useState("");
  const selectedTask = tasks.find(task => task.id === draft.taskId);
  const snapshotTask = occurrence?.task || series?.task;
  const save = async () => {
    setValidation("");
    try {
      if (standalone && !standaloneReady) throw new Error("Apply LifeOS-V2-Calendar-Entries.sql in Supabase, then retry the calendar.");
      if (standalone && !draft.title.trim()) throw new Error("Enter a task title.");
      if (!standalone && !selectedTask) throw new Error("Choose an available task before saving.");
      calendarDateSchema.parse(draft.startDay); calendarDateSchema.parse(draft.endDay);
      if (!/^\d{2}:\d{2}$/.test(draft.startTime) || !/^\d{2}:\d{2}$/.test(draft.endTime)) throw new Error("Choose valid start and end times.");
      const start = zonedInstant(draft.startDay, draft.startTime, zone), end = zonedInstant(draft.endDay, draft.endTime, zone);
      if (zonedDay(start, zone) !== draft.startDay || zonedTime(start, zone) !== draft.startTime || zonedDay(end, zone) !== draft.endDay || zonedTime(end, zone) !== draft.endTime) throw new Error("That local time does not exist in this time zone. Choose another time.");
      const task = standalone ? { id: snapshotTask?.id || id, title: draft.title.trim(), note: draft.focus.note.trim() } : focusTaskFromTask(selectedTask!, draft.focus.levels, draft.focus.note);
      const frequency = occurrence && scope === "occurrence" ? "none" : draft.frequency;
      const block = plannedBlockSchema.parse({ ...series, id, task, ...(standalone ? { origin: "calendar", workspace: "Calendar" } : { workspace: selectedTask!.workspace }), start, end, timeZone: zone, repeat: { frequency, weekdays: frequency === "weekly" ? [...new Set(draft.weekdays)] : [], until: frequency === "none" ? null : draft.until || null } });
      const command: CalendarCommand = occurrence && scope === "occurrence"
        ? { action: "exception", expectedVersion: occurrence.version, exception: { seriesId: occurrence.seriesId, date: occurrence.date, cancelled: false, override: { task, workspace: block.workspace, start, end } } }
        : { action: "save", block, expectedVersion: occurrence?.version ?? null };
      if (await onSave(command)) onClose();
    } catch (error) { setValidation(error instanceof Error && "issues" in error ? String((error as { issues: { message: string }[] }).issues[0]?.message) : error instanceof Error ? error.message : "Review the plan details."); }
  };
  const remove = async () => {
    if (!occurrence) return;
    const command: CalendarCommand = { action: "delete-scoped", id: occurrence.seriesId, date: occurrence.date, scope: occurrence.repeating ? deleteScope : "series", expectedVersion: occurrence.version };
    if (await onSave(command)) onClose();
  };
  return <GameDialog title={occurrence ? "Planned task" : "Plan a task"} titleId="calendar-plan-title" onClose={onClose}>
    {occurrence && <CalendarProgress occurrence={occurrence} ready={progressReady} busy={busy} onSave={onSave} onClose={onClose}/>}
    <form className="task-form calendar-plan-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      {(validation || error) && <p className="auth-error" role="alert">{validation || error}</p>}
      {occurrence && completionReady && !progressReady && <button className="secondary occurrence-complete" type="button" disabled={busy} onClick={async () => { if (await onSave({ action: "complete", seriesId: occurrence.seriesId, date: occurrence.date, done: !occurrence.done, expectedVersion: occurrence.completionVersion ?? null })) onClose(); }}>{occurrence.done ? "✓ Undo done" : "Done"}</button>}
      {occurrence?.done && <p className="focus-optional-hint">Completed session. Its saved details are preserved. Change the status to edit its schedule.</p>}
      {occurrence && <h3>Schedule details</h3>}
      <fieldset className="form-controls" disabled={busy || !!occurrence?.done || (!!occurrence && !series)}>
        {occurrence?.repeating && <label>Apply changes to<select value={scope} onChange={event => { const whole = event.target.value === "series"; setScope(whole ? "series" : "occurrence"); setDraft(makeDraft(whole)); setValidation(""); }}><option value="occurrence">This occurrence</option><option value="series">Entire series</option></select></label>}
        {standalone ? <><label>Task name<input required maxLength={180} autoFocus={!occurrence} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label><p className="focus-optional-hint">Calendar only. This task will not be added to a workspace.</p>{!standaloneReady && <p className="auth-error" role="alert">Calendar-only setup is required. Run LifeOS-V2-Calendar-Entries.sql in Supabase, then retry the calendar.</p>}</> : <label>Task<select required value={draft.taskId} onChange={event => setDraft(current => ({ ...current, taskId: event.target.value, focus: { levels: [], note: current.focus.note } }))}>
          <option value="">Choose a task</option>
          {!selectedTask && snapshotTask && <option value={snapshotTask.id}>{snapshotTask.title} (unavailable)</option>}
          {tasks.filter(task => (!task.done || task.id === draft.taskId) && (series?.origin !== "task" || task.id === series.task.id)).map(task => <option key={task.id} value={task.id}>{task.title}{task.done ? " (completed)" : ""}</option>)}
        </select></label>}
        {!standalone && !selectedTask && <p className="focus-optional-hint">Choose an existing task to schedule. You can create tasks from the dashboard.</p>}
        <p className="calendar-zone">Time zone: {zone}</p>
        <div className="form-grid"><label>Start date<input type="date" required value={draft.startDay} onChange={event => setDraft({ ...draft, startDay: event.target.value })}/></label><label>Start time<input type="time" required value={draft.startTime} onChange={event => setDraft({ ...draft, startTime: event.target.value })}/></label><label>End date<input type="date" required value={draft.endDay} onChange={event => setDraft({ ...draft, endDay: event.target.value })}/></label><label>End time<input type="time" required value={draft.endTime} onChange={event => setDraft({ ...draft, endTime: event.target.value })}/></label></div>
        {(!occurrence || scope === "series") && <>
          <label>Repeat<select value={draft.frequency} onChange={event => setDraft({ ...draft, frequency: event.target.value as Draft["frequency"] })}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week on selected days</option></select></label>
          {draft.frequency === "weekly" && <fieldset className="calendar-repeat-days"><legend>Repeat on</legend>{weekdays.map((day, index) => <label className="checkbox-label" key={day}><input type="checkbox" checked={draft.weekdays.includes(index)} onChange={event => setDraft({ ...draft, weekdays: event.target.checked ? [...draft.weekdays, index] : draft.weekdays.filter(value => value !== index) })}/>{day}</label>)}</fieldset>}
          {draft.frequency !== "none" && <label>Repeat through (optional)<input type="date" min={draft.startDay} value={draft.until} onChange={event => setDraft({ ...draft, until: event.target.value })}/><small>Includes this end date. Leave blank to keep repeating.</small></label>}
        </>}
        {standalone && <label>Note (optional)<textarea maxLength={1000} value={draft.focus.note} onChange={event => setDraft({ ...draft, focus: { ...draft.focus, note: event.target.value } })}/></label>}
        {!standalone && selectedTask && <FocusTaskFields key={selectedTask.id} task={selectedTask} value={draft.focus} onChange={focus => setDraft({ ...draft, focus })}/>}
        {deleting && <fieldset className="calendar-delete-options"><legend>Delete scheduled task</legend>{occurrence?.repeating ? <label>Delete<select value={deleteScope} onChange={event => setDeleteScope(event.target.value as typeof deleteScope)}><option value="occurrence">This occurrence</option><option value="following">This and following occurrences</option><option value="series">Entire series</option></select></label> : <p>Delete this calendar entry?</p>}<p>Completed history is kept. Workspace tasks are not deleted.</p><button type="button" className="secondary" onClick={() => setDeleting(false)}>Keep task</button><button type="button" className="primary" onClick={() => void remove()}>Confirm deletion</button></fieldset>}
        <div className="calendar-plan-actions">
          {occurrence && <button className="secondary calendar-delete" type="button" onClick={() => setDeleting(true)}>Delete</button>}
          <button className="secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit" disabled={standalone ? !standaloneReady || !draft.title.trim() : !selectedTask}>{busy ? "Saving…" : "Save plan"}</button>
        </div>
        {!standalone && occurrence && onFocus && <button className="primary calendar-start-focus" type="button" disabled={activeFocus || !selectedTask || selectedTask.done} onClick={() => { if (selectedTask && !selectedTask.done) { onClose(); onFocus(focusTaskFromTask(selectedTask, draft.focus.levels, draft.focus.note), occurrence.id); } }}>Start Focus</button>}
        {occurrence && activeFocus && <p className="focus-optional-hint">Stop your current focus session before starting another.</p>}
      </fieldset>
    </form>
  </GameDialog>;
}

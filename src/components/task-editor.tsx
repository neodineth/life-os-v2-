"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { GameDialog } from "./game-dialog";
import { GrammarCheck } from "./grammar-check";
import { normalizeProgress, progressPercent, setCompletedCount, type Task } from "@/lib/tasks";
import { useCalendar } from "@/hooks/use-calendar";
import { TaskScheduleFields, newScheduleDraft, scheduleDraft, scheduledBlock, type ScheduleDraft } from "./task-schedule-fields";
import type { PlannedBlock } from "@/lib/calendar";

export type TaskScheduleSave = { blocks: PlannedBlock[]; scheduleVersions: Record<string, number>; operationId: string };

export function TaskEditor({ userId, task, workspaces, existing, onSave, onDelete, onClose, busy = false, error, onRetry }: {
  userId: string; busy?: boolean; error?: string; onRetry?: () => void; task: Task; workspaces: string[]; existing: boolean; onSave: (task: Task, schedule?: TaskScheduleSave) => void; onDelete: () => void; onClose: () => void;
}) {
  const [range] = useState(() => Date.now());
  const calendar = useCalendar(userId, range - 7 * 86400000, range + 14 * 86400000);
  const initialized = useRef(false);
  const [schedulesInitialized, setSchedulesInitialized] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [rows, setRows] = useState<ScheduleDraft[]>([]);
  const [scheduleVersions, setScheduleVersions] = useState<Record<string, number>>({});
  const [validation, setValidation] = useState("");
  useEffect(() => {
    if (!calendar.ready || initialized.current) return;
    initialized.current = true;
    const blocks = calendar.blocks.filter(block => block.origin === "task" && block.task.id === task.id && block.retiredAt === undefined);
    queueMicrotask(() => { setRows(blocks.map(scheduleDraft)); setScheduleEnabled(blocks.length > 0); setScheduleVersions(Object.fromEntries(blocks.map(block => [block.id, calendar.versions[block.id]]))); setSchedulesInitialized(true); });
  }, [calendar.ready, calendar.blocks, calendar.versions, task.id]);
  const [draft, setDraft] = useState(task);
  const [levels, setLevels] = useState(!!task.progress);
  const [total, setTotal] = useState(String(task.progress?.total || 50));
  const [count, setCount] = useState<string | null>(null);
  const [unit, setUnit] = useState(task.progress?.unit || "videos");
  const [subtasks, setSubtasks] = useState(task.progress?.unit === "subtasks");
  const [subNames, setSubNames] = useState<string[]>(() => task.progress?.unit === "subtasks" ? Array.from({length: task.progress.total}, (_, i) => task.progress?.names?.[i + 1] || `Subtask ${i + 1}`) : []);
  const [newSubtask, setNewSubtask] = useState("");
  const base = task.progress || { total: 50, completed: task.done ? 50 : 0, unit: "videos" };
  const resized = normalizeProgress({ ...base, total: Number(total), unit });
  const progress = resized ? setCompletedCount(resized, count === null ? resized.completed : Number(count)) : undefined;
  return <GameDialog title={existing ? "Edit task" : "New quest"} titleId="editor-title" onClose={onClose}>
    <form className="task-form" onSubmit={e => {
      e.preventDefault();
      if (!draft.title.trim() || (levels && !progress) || (levels && !unit.trim())) return;
      if (subtasks && (!subNames.length || subNames.some(name => !name.trim()) || newSubtask.trim())) { setValidation("Add your typed subtask with Add subtask, and give every subtask a name."); return; }
      setValidation("");
      try {
        const scheduled = scheduleEnabled || task.completionMode === "occurrence";
        if (scheduled && (!calendar.ready || !calendar.taskSchedulesReady || !initialized.current)) throw new Error("Task scheduling setup is required. Retry after the migration is installed.");
        if (scheduleEnabled && !rows.length) throw new Error("Add at least one time slot or turn scheduling off.");
        const saved = { ...draft, title: draft.title.trim(), progress: subtasks ? normalizeProgress({ ...base, total: subNames.length, unit: "subtasks", names: Object.fromEntries(subNames.map((name, i) => [i + 1, name])), completedRanges: task.progress?.unit === "subtasks" ? task.progress.completedRanges : [] }) : levels ? progress : undefined, ...(scheduled ? { completionMode: "occurrence" as const, repeat: "None" } : {}) };
        onSave(saved, scheduled ? { blocks: scheduleEnabled ? rows.map(row => scheduledBlock(row, saved, calendar.timeZone)) : [], scheduleVersions, operationId: crypto.randomUUID() } : undefined);
      } catch (error) { setValidation(error instanceof Error && "issues" in error ? String((error as { issues: { message: string }[] }).issues[0]?.message) : error instanceof Error ? error.message : "Review the schedule."); }
    }}>
      {(error || validation) && <div className="auth-error" role="alert">{validation || error}{onRetry && <button className="text-button" type="button" disabled={busy} onClick={onRetry}>Retry saved request</button>}</div>}<fieldset className="form-controls" disabled={busy}>
      <label>Task<input autoFocus required maxLength={180} placeholder="Name your quest" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      <GrammarCheck text={draft.title} maxLength={180} disabled={busy} onChange={title => setDraft(current => ({ ...current, title }))}/>
      <label>Workspace<select value={draft.workspace} onChange={e => setDraft({ ...draft, workspace: e.target.value })}>{workspaces.map(w => <option key={w}>{w}</option>)}</select></label>
      <fieldset className="progress-editor"><legend>Progress tracking</legend><label className="checkbox-label"><input type="checkbox" checked={subtasks} onChange={e => { setSubtasks(e.target.checked); setLevels(false); }}/>Use named subtasks</label>{subtasks && <div><p className="focus-optional-hint">Complete these in any order. You can add more later.</p>{subNames.map((name, i) => <label key={i}>Subtask {i + 1}<input required maxLength={120} value={name} onChange={e => setSubNames(items => items.map((item, index) => index === i ? e.target.value : item))}/></label>)}<label>New subtask<input maxLength={120} value={newSubtask} onChange={e => setNewSubtask(e.target.value)}/></label><button type="button" className="secondary" disabled={!newSubtask.trim()} onClick={() => { setSubNames(items => [...items, newSubtask.trim()]); setNewSubtask(""); }}>Add subtask</button></div>}<label className="checkbox-label"><input type="checkbox" disabled={subtasks} checked={levels && !subtasks} onChange={e => setLevels(e.target.checked)}/>Enable levels</label>
        {levels && !subtasks && <div className="level-fields"><div className="form-grid"><label>Total<input type="number" required min={1} max={1000000} step={1} value={total} onChange={e => { setTotal(e.target.value); setCount(null); }}/></label><label>Completed<input type="number" required min={0} max={Number(total) || 1} step={1} value={count ?? resized?.completed ?? 0} onChange={e => setCount(e.target.value)}/></label></div><label>Unit<input required maxLength={30} placeholder="videos, chapters, steps" value={unit} onChange={e => setUnit(e.target.value)}/></label><div className="editor-progress"><span>{progress?.completed || 0}/{Number(total) || 0}</span><strong>{progress ? progressPercent(progress) : 0}%</strong></div></div>}
      </fieldset>
      <div className="form-grid"><label>Available from (optional)<input type="date" max={draft.due || undefined} value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })}/></label><div><label>Deadline (optional)<input type="date" min={draft.start || undefined} value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })}/></label>{draft.due && <button className="text-button" type="button" onClick={() => setDraft({ ...draft, due: "" })}>Remove deadline</button>}</div><p className="focus-optional-hint">Priority follows the deadline automatically: 5 days or less = High, 6–10 days = Medium, over 10 days = Low.</p>{!scheduleEnabled && task.completionMode !== "occurrence" && <label>Create next task after completion<select value={draft.repeat} onChange={e => setDraft({ ...draft, repeat: e.target.value })}>{["None", "Daily", "Weekly", "Monthly"].map(r => <option key={r}>{r}</option>)}</select></label>}</div>
      <fieldset className="progress-editor"><legend>Calendar schedule</legend><label className="checkbox-label"><input type="checkbox" checked={scheduleEnabled} disabled={!calendar.taskSchedulesReady || !calendar.ready || !schedulesInitialized} onChange={event => { setScheduleEnabled(event.target.checked); if (event.target.checked && !rows.length) setRows([newScheduleDraft(calendar.timeZone)]); }}/>Schedule on calendar</label>
        {!calendar.ready || !calendar.taskSchedulesReady ? <p className="focus-optional-hint">{calendar.error || (calendar.ready ? "Task scheduling setup is required. Install the task-schedules migration." : "Checking calendar setup…")}<button type="button" className="text-button" onClick={() => void calendar.load()}>Retry calendar setup</button></p> : null}
        {scheduleEnabled && <><p className="focus-optional-hint">Calendar sessions repeat on fixed dates. They replace creating a new task after completion.</p><TaskScheduleFields rows={rows} timeZone={calendar.timeZone} onChange={setRows}/></>}
        {schedulesInitialized && task.completionMode === "occurrence" && !scheduleEnabled && <p className="focus-optional-hint">Saving stops future time slots. Shared progress stays available; use End task to finish this task.</p>}
      </fieldset>
      <div className="modal-actions">{existing && <button className="delete-button icon-button" aria-label="Delete task" type="button" onClick={() => { if (window.confirm("Delete this task?")) onDelete(); }}><Trash2 size={17}/></button>}<button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit">{busy ? "Saving?" : "Save"}<ArrowRight size={16}/></button></div>
      </fieldset>
    </form>
  </GameDialog>;
}

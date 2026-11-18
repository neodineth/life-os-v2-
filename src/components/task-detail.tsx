"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Trophy, X } from "lucide-react";
import { GameDialog } from "./game-dialog";
import { GrammarCheck } from "./grammar-check";
import { FocusTaskFields, emptyFocusDraft, type FocusDraft } from "./focus-task-fields";
import { focusTaskFromTask, type FocusTask } from "@/lib/focus";
import { isLevelComplete, levelLabel, progressPercent, renameLevel, toggleLevel, type Task, type TaskProgress } from "@/lib/tasks";
import { TaskOccurrences } from "./task-occurrences";

export function ProgressBar({ progress, title }: { progress: TaskProgress; title: string }) {
  return <span className="progress-track" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed} aria-valuetext={`${progress.completed} of ${progress.total}, ${progressPercent(progress)} percent`}><span style={{ width: `${progressPercent(progress)}%` }}/></span>;
}

export function TaskDetail({ userId, task, onChange, onToggle, onEdit, onClose, busy = false, error, onRetry, onStart }: {
  userId?: string;
  onStart?: (task: FocusTask) => void;
  busy?: boolean; error?: string; onRetry?: () => void; task: Task; onChange: (update: (task: Task) => Task) => void | Promise<boolean>; onToggle: () => void; onEdit: () => void; onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [rename, setRename] = useState<{ level: number; name: string } | null>(null);
  const [focusDraft, setFocusDraft] = useState<FocusDraft>(emptyFocusDraft);
  const canFocus = !task.done && !!onStart;
  const progress = task.progress;
  const subtasks = progress?.unit === "subtasks";
  const [newSubtask, setNewSubtask] = useState("");
  const pages = progress ? Math.ceil(progress.total / 50) : 1;
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * 50 + 1;
  return <GameDialog title={task.title} titleId="quest-title" onClose={onClose} wide actions={<button className="icon-button" aria-label={`Edit ${task.title}`} disabled={busy} onClick={onEdit}><Pencil size={16}/></button>}>
    {error && <div className="notice" role="alert">{error}{onRetry && <button type="button" disabled={busy} onClick={onRetry}>Retry</button>}</div>}{busy && <p className="sync-status" role="status">Saving?</p>}
    <fieldset disabled={busy} className={`quest-detail ${task.done ? "quest-cleared" : ""}`}>
      <div className="quest-meta"><span>{task.workspace}</span><span>{task.done ? <><Trophy size={14}/> Cleared</> : "In progress"}</span></div>
      {progress ? <>
        <div className="detail-score"><div><strong>{progressPercent(progress)}<small>%</small></strong><span>{progress.completed}/{progress.total} {progress.unit}</span></div><span className="xp-pill">{progress.completed * 10} XP</span></div>
        <ProgressBar progress={progress} title={task.title}/>
        <div className="levels-toolbar"><h3>{subtasks ? "Subtasks" : "Levels"} <span>{progress.total}</span></h3><span>+10 XP / level</span></div>
        {canFocus && <p className="focus-optional-hint">Choose any {subtasks ? "subtasks" : "levels"} for focus (optional).</p>}
        <div className={subtasks ? "subtask-grid" : "level-grid"}>
          {Array.from({ length: Math.min(50, progress.total - start + 1) }, (_, index) => {
            const level = start + index;
            const done = isLevelComplete(progress, level);
            const label = levelLabel(progress, level);
            return <div className={`level-tile ${done ? "complete" : ""}`} key={level}>
              {canFocus && <label className="level-focus-choice"><input type="checkbox" aria-label={`Focus on ${label}`} checked={focusDraft.levels.includes(level)} onChange={event => setFocusDraft(current => ({ ...current, levels: event.target.checked ? [...current.levels, level] : current.levels.filter(item => item !== level) }))}/><span>Focus on this {subtasks ? "subtask" : "level"}</span></label>}
              {rename?.level === level ? <form className="rename-form" onSubmit={e => { e.preventDefault(); const name = rename.name; onChange(t => ({ ...t, progress: renameLevel(t.progress!, level, name) })); setRename(null); }}>
                <label className="sr-only" htmlFor={`name-${level}`}>Level {level} name</label><input id={`name-${level}`} autoFocus maxLength={120} placeholder={levelLabel({ ...progress, names: {} }, level)} value={rename.name} onChange={e => setRename({ level, name: e.target.value })}/>
                <button className="icon-button" aria-label="Save level name" type="submit"><Check size={15}/></button><button className="icon-button" aria-label="Cancel rename" type="button" onClick={() => setRename(null)}><X size={15}/></button>
                <GrammarCheck text={rename.name} maxLength={120} disabled={busy} onChange={name => setRename(current => current ? { ...current, name } : null)}/>
              </form> : <>
                <button className="level-play" aria-label={`${done ? "Undo" : "Complete"} ${label}`} aria-pressed={done} onClick={() => onChange(t => ({ ...t, progress: toggleLevel(t.progress!, level) }))}>
                  <span className="level-number">{done ? <Check size={18}/> : String(level).padStart(2, "0")}</span><span className="level-name">{label}</span><span className="level-reward">{done ? "DONE" : "+10 XP"}</span>
                </button>
                <button className="rename-button" aria-label={`Rename ${label}`} onClick={() => setRename({ level, name: progress.names?.[level] || "" })}><Pencil size={12}/></button>
              </>}
            </div>;
          })}
        </div>
        {subtasks && <div className="subtask-add"><label>Add another subtask<input maxLength={120} value={newSubtask} onChange={e => setNewSubtask(e.target.value)}/></label><button type="button" className="secondary" disabled={!newSubtask.trim() || busy} onClick={async () => { const name = newSubtask.trim(); const saved = await onChange(t => ({ ...t, done: false, progress: { ...t.progress!, total: t.progress!.total + 1, names: { ...t.progress!.names, [t.progress!.total + 1]: name } } })); if (saved) setNewSubtask(""); }}>Add subtask</button></div>}
        {pages > 1 && <div className="level-pagination"><button className="icon-button" aria-label="Previous levels" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setRename(null); }}><ChevronLeft size={18}/></button><label>Page <input aria-label="Level page" type="number" min={1} max={pages} value={currentPage + 1} onChange={e => { setPage(Math.max(0, Math.min(pages - 1, Number(e.target.value) - 1))); setRename(null); }}/><span>/ {pages}</span></label><button className="icon-button" aria-label="Next levels" disabled={currentPage === pages - 1} onClick={() => { setPage(currentPage + 1); setRename(null); }}><ChevronRight size={18}/></button></div>}
      </> : task.completionMode === "occurrence" ? null : <div className="single-quest"><div className="single-emblem">{task.done ? <Trophy size={42}/> : <Check size={42}/>}</div><span className="xp-pill">50 XP</span><button className="primary" onClick={onToggle}>{task.done ? "Reopen" : "Complete quest"}<Check size={17}/></button></div>}
      {task.completionMode === "occurrence" && userId && <TaskOccurrences userId={userId} task={task} busy={busy} onToggle={onToggle}/>}
      {canFocus && <div className="task-focus-setup"><h3>Start a focus session</h3>
        <FocusTaskFields task={task} value={focusDraft} onChange={setFocusDraft} showLevels={false}/>
        <button className="primary task-start-focus" type="button" onClick={() => onStart?.(focusTaskFromTask(task, focusDraft.levels, focusDraft.note))}>Focus</button>
      </div>}
    </fieldset>
  </GameDialog>;
}

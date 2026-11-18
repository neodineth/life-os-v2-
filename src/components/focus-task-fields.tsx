"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { levelLabel, type Task } from "@/lib/tasks";

export type FocusDraft = { levels: number[]; note: string };
export const emptyFocusDraft: FocusDraft = { levels: [], note: "" };

export function FocusTaskFields({ task, value, onChange, showLevels = true }: {
  task: Task; value: FocusDraft; onChange: (value: FocusDraft) => void; showLevels?: boolean;
}) {
  const noteId = useId();
  const [page, setPage] = useState(0);
  const progress = task.progress;
  const pages = progress ? Math.ceil(progress.total / 50) : 1;
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * 50 + 1;
  const selectedCount = value.levels.filter(level => progress && level <= progress.total).length;
  return <div className="focus-task-fields">
    {showLevels && progress && <fieldset className="focus-level-picker"><legend>{progress.unit === "subtasks" ? "Subtasks" : "Levels"} (optional)</legend>
      <div className="focus-level-options">{Array.from({ length: Math.min(50, progress.total - start + 1) }, (_, index) => {
        const level = start + index;
        return <label key={level} className={value.levels.includes(level) ? "selected" : ""}>
          <input type="checkbox" checked={value.levels.includes(level)} onChange={event => onChange({ ...value, levels: event.target.checked ? [...value.levels, level] : value.levels.filter(item => item !== level) })}/>
          <span><small>{progress.unit === "subtasks" ? "Subtask" : "Level"} {level}</small>{levelLabel(progress, level)}</span>
        </label>;
      })}</div>
      {pages > 1 && <div className="level-pagination">
        <button className="icon-button" type="button" aria-label={`Previous focus levels for ${task.title}`} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18}/></button>
        <label>Page <input aria-label={`Focus level page for ${task.title}`} type="number" min={1} max={pages} value={currentPage + 1} onChange={event => setPage(Math.max(0, Math.min(pages - 1, Number(event.target.value) - 1)))}/><span>/ {pages}</span></label>
        <button className="icon-button" type="button" aria-label={`Next focus levels for ${task.title}`} disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18}/></button>
      </div>}
    </fieldset>}
    {progress && <p className="focus-optional-hint">{selectedCount ? `${selectedCount} level${selectedCount === 1 ? "" : "s"} selected for focus.` : "You can start focus without selecting any levels."}</p>}
    <label className="focus-note-label" htmlFor={noteId}>Focus note (optional)</label>
    <textarea id={noteId} rows={3} maxLength={1000} value={value.note} onChange={event => onChange({ ...value, note: event.target.value })} placeholder="What would you like to work on?"/>
  </div>;
}

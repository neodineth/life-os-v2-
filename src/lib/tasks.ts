import { addDays, addMonths, format, parseISO } from "date-fns";

export type LevelRange = [number, number];
export type TaskProgress = {
  total: number; completed: number; unit: string;
  completedRanges?: LevelRange[];
  names?: Record<string, string>;
};
export type Task = {
  id: string; title: string; workspace: string; due: string; start: string;
  priority: string; done: boolean; focus: string; repeat: string; completedAt?: string;
  progress?: TaskProgress; recurrenceParentId?: string;
  completionMode?: "task" | "occurrence";
};

function mergeRanges(ranges: LevelRange[], total: number): LevelRange[] {
  const sorted = ranges.filter(r => Array.isArray(r) && Number.isSafeInteger(r[0]) && Number.isSafeInteger(r[1]) && r[0] <= r[1])
    .map(([start, end]): LevelRange => [Math.max(1, start), Math.min(total, end)])
    .filter(([start, end]) => start <= end).sort((a, b) => a[0] - b[0]);
  const merged: LevelRange[] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

export function normalizeProgress(progress?: TaskProgress): TaskProgress | undefined {
  if (!progress || !Number.isSafeInteger(progress.total) || progress.total < 1 || progress.total > 1000000) return undefined;
  const legacyCount = Math.max(0, Math.min(progress.total, Math.trunc(Number(progress.completed) || 0)));
  const completedRanges = mergeRanges(Array.isArray(progress.completedRanges) ? progress.completedRanges : legacyCount ? [[1, legacyCount]] : [], progress.total);
  const names = Object.fromEntries(Object.entries(progress.names || {}).filter(([key, name]) =>
    /^\d+$/.test(key) && Number(key) >= 1 && Number(key) <= progress.total && typeof name === "string" && name.trim()
  ).map(([key, name]) => [String(Number(key)), name.trim().slice(0, 120)]));
  return {
    total: progress.total,
    completed: completedRanges.reduce((sum, [start, end]) => sum + end - start + 1, 0),
    unit: typeof progress.unit === "string" ? progress.unit.trim().slice(0, 30) || "steps" : "steps",
    completedRanges, names,
  };
}

export function isLevelComplete(progress: TaskProgress, level: number): boolean {
  return (progress.completedRanges ?? (progress.completed ? [[1, progress.completed]] : [])).some(([start, end]) => level >= start && level <= end);
}

export function toggleLevel(progress: TaskProgress, level: number): TaskProgress {
  const normalized = normalizeProgress(progress)!;
  if (!Number.isSafeInteger(level) || level < 1 || level > normalized.total) return normalized;
  const ranges: LevelRange[] = [];
  if (isLevelComplete(normalized, level)) {
    for (const [start, end] of normalized.completedRanges!) {
      if (level < start || level > end) ranges.push([start, end]);
      else {
        if (start < level) ranges.push([start, level - 1]);
        if (level < end) ranges.push([level + 1, end]);
      }
    }
  } else ranges.push(...normalized.completedRanges!, [level, level]);
  return normalizeProgress({ ...normalized, completedRanges: ranges })!;
}

export function setCompletedCount(progress: TaskProgress, count: number): TaskProgress {
  const normalized = normalizeProgress(progress)!;
  const target = Math.max(0, Math.min(normalized.total, Math.trunc(Number(count) || 0)));
  let difference = target - normalized.completed;
  const ranges = normalized.completedRanges!.map(([a, b]): LevelRange => [a, b]);
  if (difference > 0) {
    let cursor = 1;
    const additions: LevelRange[] = [];
    for (const [start, end] of ranges) {
      if (difference && start > cursor) {
        const amount = Math.min(difference, start - cursor);
        additions.push([cursor, cursor + amount - 1]); difference -= amount;
      }
      cursor = end + 1;
    }
    if (difference) additions.push([cursor, cursor + difference - 1]);
    ranges.push(...additions);
  } else {
    let remove = -difference;
    while (remove && ranges.length) {
      const last = ranges.at(-1)!;
      const amount = Math.min(remove, last[1] - last[0] + 1);
      last[1] -= amount; remove -= amount;
      if (last[1] < last[0]) ranges.pop();
    }
  }
  return normalizeProgress({ ...normalized, completedRanges: ranges })!;
}

export function renameLevel(progress: TaskProgress, level: number, name: string): TaskProgress {
  const normalized = normalizeProgress(progress)!;
  if (!Number.isSafeInteger(level) || level < 1 || level > normalized.total) return normalized;
  const names = { ...normalized.names };
  if (name.trim()) names[level] = name.trim().slice(0, 120);
  else delete names[level];
  return { ...normalized, names };
}

export function levelLabel(progress: TaskProgress, level: number): string {
  const unit = progress.unit.replace(/s$/i, "") || "Level";
  return progress.names?.[level] || `${unit.charAt(0).toUpperCase() + unit.slice(1)} ${level}`;
}

export function progressPercent(progress: TaskProgress): number {
  return progress.completed >= progress.total ? 100 : Math.min(99, Math.round(progress.completed / progress.total * 100));
}

export function playerStats(tasks: Task[]) {
  const xp = tasks.reduce((sum, task) => sum + (task.progress ? (normalizeProgress(task.progress)?.completed || 0) * 10 : task.done ? 50 : 0), 0);
  return { xp, level: Math.floor(xp / 100) + 1, levelXP: xp % 100 };
}

export function saveTask(tasks: Task[], input: Task, today: string, nextId: string): Task[] {
  const previous = tasks.find(t => t.id === input.id);
  const progress = normalizeProgress(input.progress);
  const done = input.completionMode === "occurrence" ? input.done : progress ? progress.completed === progress.total : input.done;
  const updated = { ...input, progress, done, completedAt: done ? previous?.completedAt || today : undefined };
  const result = previous ? tasks.map(t => t.id === input.id ? updated : t) : [...tasks, updated];
  if (updated.completionMode !== "occurrence" && done && !previous?.done && updated.repeat !== "None" && !tasks.some(t => t.recurrenceParentId === updated.id)) {
    const base = parseISO(updated.due || today);
    const due = updated.repeat === "Monthly" ? addMonths(base, 1) : addDays(base, updated.repeat === "Weekly" ? 7 : 1);
    result.push({ ...updated, id: nextId, due: format(due, "yyyy-MM-dd"), done: false, completedAt: undefined,
      focus: "", start: "", recurrenceParentId: updated.id,
      progress: progress ? { ...progress, completed: 0, completedRanges: [] } : undefined });
  }
  return result;
}

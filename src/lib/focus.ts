import { z } from "zod";
import { levelLabel, type Task } from "./tasks.ts";
import { TZDate } from "@date-fns/tz";

export const ABSENCE_GRACE_MS = 10000;
export const RETURN_GRACE_MS = 1000;
export const TRACKING_GAP_MS = 5000;
export function focusSampleFresh(age: number) { return Number.isFinite(age) && age >= 0 && age <= TRACKING_GAP_MS; }
export const SHORT_BREAK_MS = 5 * 60 * 1000;
export type FocusState = "focus" | "away" | "untracked" | "paused";
export type FocusTask = { id: string; title: string; levels?: { number: number; title: string }[]; note?: string };
export function focusTaskFromTask(task: Task, levels: number[] = [], note = ""): FocusTask {
  const selected = task.progress ? [...new Set(levels)].filter(level => Number.isSafeInteger(level) && level >= 1 && level <= task.progress!.total).sort((a, b) => a - b)
    .map(number => ({ number, title: levelLabel(task.progress!, number) })) : [];
  const text = note.trim().slice(0, 1000);
  return { id: task.id, title: task.title, ...(selected.length ? { levels: selected } : {}), ...(text ? { note: text } : {}) };
}
export type FocusSegment = { state: FocusState; start: number; end: number };
export type FocusSession = { id: string; tasks: FocusTask[]; startedAt: number; endedAt: number; segments: FocusSegment[]; interrupted: boolean; plannedOccurrenceId?: string };
export type LiveFocus = {
  id: string; tasks: FocusTask[]; startedAt: number; segments: FocusSegment[];
  state: FocusState; since: number; lastSample: number;
  candidate: { state: "focus" | "away"; since: number } | null; plannedOccurrenceId?: string;
};
const instant = z.number().finite().nonnegative();
const segmentSchema = z.object({ state: z.enum(["focus", "away", "untracked", "paused"]), start: instant, end: instant }).refine(s => s.end >= s.start);
export const focusHistorySchema = z.array(z.object({
  id: z.string(), tasks: z.array(z.object({
    id: z.string(), title: z.string(),
    levels: z.array(z.object({ number: z.number().int().min(1).max(1000000), title: z.string() })).optional(),
    note: z.string().max(1000).optional(),
  })).min(1),
  startedAt: instant, endedAt: instant, segments: z.array(segmentSchema), interrupted: z.boolean(), plannedOccurrenceId: z.string().max(200).optional(),
}).superRefine((s, ctx) => {
  let end = s.startedAt;
  for (const segment of s.segments) {
    if (segment.start < end || segment.end > s.endedAt) ctx.addIssue({ code: "custom", message: "Invalid focus timeline" });
    end = segment.end;
  }
  if (s.endedAt < s.startedAt) ctx.addIssue({ code: "custom", message: "Invalid session dates" });
}));

export function beginFocus(id: string, tasks: FocusTask[], now: number, plannedOccurrenceId?: string): LiveFocus {
  return { id, tasks, startedAt: now, segments: [], state: "untracked", since: now, lastSample: now, candidate: null, ...(plannedOccurrenceId ? { plannedOccurrenceId } : {}) };
}
export function transitionFocus(session: LiveFocus, state: FocusState, now: number): LiveFocus {
  const at = Math.max(now, session.since);
  if (session.state === state) return { ...session, candidate: null };
  const segments = at > session.since ? [...session.segments, { state: session.state, start: session.since, end: at }] : session.segments;
  return { ...session, segments, state, since: at, candidate: null };
}
export function trackingGap(session: LiveFocus, now: number): LiveFocus {
  if (session.state === "paused" || now - session.lastSample <= TRACKING_GAP_MS) return session;
  return transitionFocus(session, "untracked", Math.max(session.since, session.lastSample + TRACKING_GAP_MS));
}
export function observeFocus(session: LiveFocus, eyesVisible: boolean, now: number): LiveFocus {
  let next = trackingGap(session, now);
  next = { ...next, lastSample: now };
  if (next.state === "paused") return next;
  const target = eyesVisible ? "focus" : "away";
  if (target === next.state) return { ...next, candidate: null };
  if (next.candidate?.state !== target) return { ...next, candidate: { state: target, since: now } };
  if (now - next.candidate.since < (eyesVisible ? RETURN_GRACE_MS : ABSENCE_GRACE_MS)) return next;
  return transitionFocus(next, target, next.candidate.since);
}
export function snapshotFocus(session: LiveFocus, now: number, interrupted = true): FocusSession {
  const next = trackingGap(session, now);
  const end = Math.max(now, next.since);
  return { id: next.id, tasks: next.tasks, startedAt: next.startedAt, endedAt: end, interrupted,
    ...(next.plannedOccurrenceId ? { plannedOccurrenceId: next.plannedOccurrenceId } : {}),
    segments: [...next.segments, ...(end > next.since ? [{ state: next.state, start: next.since, end }] : [])] };
}
export function breakLabel(milliseconds: number) { return milliseconds <= SHORT_BREAK_MS ? "Short break" : "Long break"; }
export function durationLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function dayKey(at: number, timeZone?: string) {
  const date = timeZone ? new TZDate(at, timeZone) : new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export type DailyFocus = { focus: number; away: number; untracked: number; paused: number };
export function focusByDay(sessions: FocusSession[], timeZone?: string): Record<string, DailyFocus> {
  const days: Record<string, DailyFocus> = {};
  for (const session of sessions) for (const segment of session.segments) {
    let cursor = segment.start;
    while (cursor < segment.end) {
      const day = dayKey(cursor, timeZone);
      const midnight = timeZone ? new TZDate(cursor, timeZone) : new Date(cursor); midnight.setHours(24, 0, 0, 0);
      const end = Math.min(segment.end, midnight.getTime());
      days[day] ??= { focus: 0, away: 0, untracked: 0, paused: 0 };
      days[day][segment.state] += end - cursor;
      cursor = end;
    }
  }
  return days;
}

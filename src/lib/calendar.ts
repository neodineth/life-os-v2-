import { z } from "zod";
import { workspaceIdSchema } from "./workspaces.ts";
import { TZDate } from "@date-fns/tz";
import { focusHistorySchema } from "./focus.ts";

export const DEFAULT_TIME_ZONE = "Asia/Colombo";
export const timeZoneSchema = z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid time zone");
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + "T00:00:00Z"); return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value; }, "Invalid date");
const instant = z.number().int().min(0).max(253402300799999);
export const focusTaskSchema = focusHistorySchema.element.shape.tasks.element;
const workspace = z.union([workspaceIdSchema, z.literal("Calendar")]);
export const repeatSchema = z.object({ frequency: z.enum(["none", "daily", "weekly"]), weekdays: z.array(z.number().int().min(0).max(6)).max(7), until: calendarDateSchema.nullable() }).strict().refine(value => value.frequency !== "weekly" || value.weekdays.length > 0, "Select at least one weekday");
export const blockDetailsSchema = z.object({ task: focusTaskSchema, workspace, start: instant, end: instant }).strict().refine(value => value.end > value.start && value.end - value.start <= 7 * 86400000, "Choose an end after the start (up to seven days)");
export const plannedBlockSchema = z.object({ id: z.uuid(), task: focusTaskSchema, workspace, start: instant, end: instant, timeZone: timeZoneSchema, repeat: repeatSchema, origin: z.enum(["task", "calendar"]).optional(), retiredAt: instant.optional() }).strict().superRefine((value, ctx) => {
  if ((value.origin === "calendar") !== (value.workspace === "Calendar")) ctx.addIssue({ code: "custom", message: "Calendar-only entries must use the Calendar destination" });
  if (value.origin === "calendar" && value.retiredAt !== undefined) ctx.addIssue({ code: "custom", message: "Calendar-only entries cannot be task-retired" });
  if (value.end <= value.start || value.end - value.start > 7 * 86400000) ctx.addIssue({ code: "custom", message: "Choose an end after the start (up to seven days)" });
  if (value.repeat.until && timeZoneSchema.safeParse(value.timeZone).success && value.repeat.until < zonedDay(value.start, value.timeZone)) ctx.addIssue({ code: "custom", message: "Repeat end must be on or after the start date" });
});
export type PlannedBlock = z.infer<typeof plannedBlockSchema>;
export type CalendarException = { seriesId: string; date: string; cancelled: boolean; override?: z.infer<typeof blockDetailsSchema> };
export const exceptionSchema = z.object({ seriesId: z.uuid(), date: calendarDateSchema, cancelled: z.boolean(), override: blockDetailsSchema.optional() }).strict().refine(value => value.cancelled || !!value.override, "An occurrence needs new times or cancellation");
export const occurrenceSchema = z.object({ task: focusTaskSchema, workspace, start: instant, end: instant, id: z.string(), seriesId: z.uuid(), date: calendarDateSchema, version: z.number().int().positive(), repeating: z.boolean(), timeZone: timeZoneSchema });
export const calendarStatusSchema = z.enum(["pending", "completed", "partial", "could_not_complete"]);
export type CalendarStatus = z.infer<typeof calendarStatusSchema>;
export const calendarStatusLabels: Record<CalendarStatus, string> = { pending: "Not completed yet", completed: "Completed", partial: "Partially completed", could_not_complete: "Couldn't complete" };
export const completionSchema = z.object({ seriesId: z.uuid(), date: calendarDateSchema, done: z.boolean(), status: calendarStatusSchema.optional(), notes: z.string().max(10000).optional(), version: z.number().int().positive(), occurrence: occurrenceSchema });
export const calendarCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("progress"), seriesId: z.uuid(), date: calendarDateSchema, status: calendarStatusSchema, notes: z.string().max(10000), expectedVersion: z.number().int().positive().nullable(), expectedSeriesVersion: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("delete-scoped"), id: z.uuid(), date: calendarDateSchema, scope: z.enum(["occurrence", "following", "series"]), expectedVersion: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("save"), block: plannedBlockSchema, expectedVersion: z.number().int().positive().nullable() }).strict(),
  z.object({ action: z.literal("exception"), exception: exceptionSchema, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid(), expectedVersion: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("complete"), seriesId: z.uuid(), date: calendarDateSchema, done: z.boolean(), expectedVersion: z.number().int().positive().nullable() }).strict(),
]);
export type CalendarCommand = z.infer<typeof calendarCommandSchema>;
export const calendarSnapshotSchema = z.object({ timeZone: timeZoneSchema, blocks: z.array(plannedBlockSchema), exceptions: z.array(exceptionSchema), versions: z.record(z.string(), z.number().int().positive()), completions: z.array(completionSchema).optional(), progressReady: z.boolean().optional(), standaloneReady: z.boolean().optional(), taskSchedulesReady: z.boolean().optional() });
export type CalendarSnapshot = z.infer<typeof calendarSnapshotSchema>;
export type CalendarOccurrence = z.infer<typeof occurrenceSchema> & { done?: boolean; status?: CalendarStatus; notes?: string; completionVersion?: number };

export function zonedDay(at: number, timeZone: string) {
  const date = new TZDate(at, timeZone);
  return `${date.getFullYear().toString().padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(day: string, amount: number) {
  const date = new Date(day + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}
export function dayOfWeek(day: string) { return new Date(day + "T12:00:00Z").getUTCDay(); }
export function zonedInstant(day: string, time: string, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number), [hours, minutes] = time.split(":").map(Number);
  return +new TZDate(year, month - 1, date, hours, minutes, 0, 0, timeZone);
}
export function zonedTime(at: number, timeZone: string) { const date = new TZDate(at, timeZone); return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
export function minuteOfDay(at: number, timeZone: string) { const date = new TZDate(at, timeZone); return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000; }
export function nextMidnight(at: number, timeZone: string) { return zonedInstant(shiftDay(zonedDay(at, timeZone), 1), "00:00", timeZone); }
export function shiftWallMinutes(at: number, minutes: number, timeZone: string) { const date = new TZDate(at, timeZone); date.setMinutes(date.getMinutes() + minutes); return +date; }
export function dragOccurrence(occurrence: CalendarOccurrence, mode: "move" | "start" | "end", deltaMinutes: number, timeZone: string): CalendarOccurrence {
  const start = mode === "end" ? occurrence.start : shiftWallMinutes(occurrence.start, deltaMinutes, timeZone);
  const end = mode === "start" ? occurrence.end : shiftWallMinutes(occurrence.end, deltaMinutes, timeZone);
  return { ...occurrence, start: mode === "start" ? Math.min(start, end - 15 * 60000) : start, end: mode === "end" ? Math.max(end, start + 15 * 60000) : end };
}

export function occurrenceOn(block: PlannedBlock, date: string, version: number): CalendarOccurrence | null {
  const firstDay = zonedDay(block.start, block.timeZone);
  if (date < firstDay || (block.repeat.until && date > block.repeat.until)) return null;
  if (block.repeat.frequency === "none" && date !== firstDay) return null;
  if (block.repeat.frequency === "weekly" && !block.repeat.weekdays.includes(dayOfWeek(date))) return null;
  const endDayOffset = Math.round((Date.parse(zonedDay(block.end, block.timeZone)) - Date.parse(firstDay)) / 86400000);
  const copyTime = (at: number, targetDay: string) => {
    const original = new TZDate(at, block.timeZone), [year, month, day] = targetDay.split("-").map(Number);
    return +new TZDate(year, month - 1, day, original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds(), block.timeZone);
  };
  const start = date === firstDay ? block.start : copyTime(block.start, date);
  const end = date === firstDay ? block.end : copyTime(block.end, shiftDay(date, endDayOffset));
  if (end <= start) return null;
  return { id: `${block.id}@${date}`, seriesId: block.id, date, version, task: block.task, workspace: block.workspace, start, end, repeating: block.repeat.frequency !== "none", timeZone: block.timeZone };
}

export function expandCalendar(snapshot: CalendarSnapshot, from: number, to: number): CalendarOccurrence[] {
  if (!(Number.isFinite(from) && Number.isFinite(to) && to > from && to - from <= 367 * 86400000)) throw new Error("Calendar range must be at most one year");
  const exceptions = new Map(snapshot.exceptions.map(item => [`${item.seriesId}@${item.date}`, item]));
  const results = new Map<string, CalendarOccurrence>();
  for (const block of snapshot.blocks) {
    const begin = shiftDay(zonedDay(from, block.timeZone), -7), end = zonedDay(to, block.timeZone);
    const dates = new Set<string>();
    for (let date = begin; date <= end; date = shiftDay(date, 1)) dates.add(date);
    // A moved occurrence can originate outside the currently visible week.
    for (const item of snapshot.exceptions) if (item.seriesId === block.id) dates.add(item.date);
    for (const date of dates) {
      let occurrence = occurrenceOn(block, date, snapshot.versions[block.id]);
      if (!occurrence) continue;
      const exception = exceptions.get(occurrence.id);
      if (exception?.cancelled) continue;
      if (exception?.override) occurrence = { ...occurrence, ...exception.override };
      if (block.retiredAt !== undefined && occurrence.start >= block.retiredAt) continue;
      if (occurrence.end > from && occurrence.start < to) results.set(occurrence.id, occurrence);
    }
  }
  for (const completion of snapshot.completions || []) {
    const id = `${completion.seriesId}@${completion.date}`, current = results.get(id);
    if (completion.done) {
      const occurrence = { ...completion.occurrence, version: snapshot.versions[completion.seriesId] || completion.occurrence.version, done: true, status: "completed" as const, notes: completion.notes || "", completionVersion: completion.version };
      if (occurrence.end > from && occurrence.start < to) results.set(id, occurrence); else results.delete(id);
    } else {
      const status = completion.status === "completed" ? "pending" : completion.status || "pending";
      const source = current || (status !== "pending" || completion.notes ? completion.occurrence : undefined);
      if (source && source.end > from && source.start < to) results.set(id, { ...source, done: false, status, notes: completion.notes || "", completionVersion: completion.version });
    }
  }
  return [...results.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export type DaySlice<T> = { value: T; start: number; end: number; day: string };
export function splitAtMidnights<T>(value: T, start: number, end: number, timeZone: string): DaySlice<T>[] {
  const slices: DaySlice<T>[] = [];
  while (start < end) { const stop = Math.min(end, nextMidnight(start, timeZone)); slices.push({ value, start, end: stop, day: zonedDay(start, timeZone) }); start = stop; }
  return slices;
}

export function arrangeOverlaps<T extends { start: number; end: number }>(events: T[]): (T & { column: number; columns: number })[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: (T & { column: number; columns: number })[] = [];
  let group: typeof result = [], ends: number[] = [], groupEnd = -Infinity;
  const finish = () => { for (const item of group) item.columns = ends.length; result.push(...group); group = []; ends = []; };
  for (const event of sorted) {
    if (event.start >= groupEnd) { finish(); groupEnd = -Infinity; }
    let column = ends.findIndex(end => end <= event.start); if (column < 0) column = ends.length;
    ends[column] = event.end; groupEnd = Math.max(groupEnd, event.end); group.push({ ...event, column, columns: 1 });
  }
  finish(); return result;
}


export function calendarBlockAppearance(occurrence: Pick<CalendarOccurrence, "done" | "status" | "end">, now: number) {
  if (occurrence.done || occurrence.status === "completed") return "completed";
  if (occurrence.status === "could_not_complete") return "could_not_complete";
  if (occurrence.status === "partial") return "partial";
  return now >= occurrence.end ? "elapsed" : "upcoming";
}

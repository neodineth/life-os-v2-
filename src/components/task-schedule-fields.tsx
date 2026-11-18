"use client";

import { dayOfWeek, plannedBlockSchema, zonedDay, zonedInstant, zonedTime, type PlannedBlock } from "@/lib/calendar";
import type { Task } from "@/lib/tasks";

export type ScheduleDraft = { id: string; startDay: string; startTime: string; endDay: string; endTime: string; frequency: "none" | "daily" | "weekly"; weekdays: number[]; until: string; original?: PlannedBlock };
export function newScheduleDraft(timeZone: string): ScheduleDraft {
  const day = zonedDay(Date.now(), timeZone);
  return { id: crypto.randomUUID(), startDay: day, startTime: "09:00", endDay: day, endTime: "10:00", frequency: "weekly", weekdays: [dayOfWeek(day)], until: "" };
}
export function scheduleDraft(block: PlannedBlock): ScheduleDraft {
  return { id: block.id, startDay: zonedDay(block.start, block.timeZone), startTime: zonedTime(block.start, block.timeZone), endDay: zonedDay(block.end, block.timeZone), endTime: zonedTime(block.end, block.timeZone), frequency: block.repeat.frequency, weekdays: block.repeat.weekdays, until: block.repeat.until || "", original: block };
}
export function scheduledBlock(row: ScheduleDraft, task: Task, timeZone: string): PlannedBlock {
  const zone = row.original?.timeZone || timeZone;
  const start = zonedInstant(row.startDay, row.startTime, zone), end = zonedInstant(row.endDay, row.endTime, zone);
  if (zonedDay(start, zone) !== row.startDay || zonedTime(start, zone) !== row.startTime || zonedDay(end, zone) !== row.endDay || zonedTime(end, zone) !== row.endTime) throw new Error("A selected local time does not exist. Choose another time.");
  return plannedBlockSchema.parse({ id: row.id, task: { ...row.original?.task, id: task.id, title: task.title }, workspace: task.workspace, start, end, timeZone: zone, origin: "task", repeat: { frequency: row.frequency, weekdays: row.frequency === "weekly" ? [...new Set(row.weekdays)] : [], until: row.frequency === "none" ? null : row.until || null } });
}

export function TaskScheduleFields({ rows, timeZone, onChange }: { rows: ScheduleDraft[]; timeZone: string; onChange: (rows: ScheduleDraft[]) => void }) {
  const update = (index: number, change: Partial<ScheduleDraft>) => onChange(rows.map((row, i) => i === index ? { ...row, ...change } : row));
  return <div className="task-schedule-fields"><p className="focus-optional-hint">Times use {timeZone}. A deadline does not stop these repeats. Different rows can use different times.</p>
    {rows.map((row, index) => <fieldset className="task-schedule-row" key={row.id}><legend>Time slot {index + 1}</legend>
      <p className="focus-optional-hint">Time zone: {row.original?.timeZone || timeZone}</p>
      <div className="form-grid"><label>Session start date<input type="date" required value={row.startDay} onChange={event => update(index, { startDay: event.target.value })}/></label><label>Session start time<input type="time" required value={row.startTime} onChange={event => update(index, { startTime: event.target.value })}/></label><label>Session end date<input type="date" required value={row.endDay} onChange={event => update(index, { endDay: event.target.value })}/></label><label>Session end time<input type="time" required value={row.endTime} onChange={event => update(index, { endTime: event.target.value })}/></label></div>
      <label>Calendar repeat<select value={row.frequency} onChange={event => update(index, { frequency: event.target.value as ScheduleDraft["frequency"] })}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      {row.frequency === "weekly" && <fieldset className="calendar-repeat-days"><legend>Weekdays</legend>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, weekday) => <label className="checkbox-label" key={day}><input type="checkbox" checked={row.weekdays.includes(weekday)} onChange={event => update(index, { weekdays: event.target.checked ? [...row.weekdays, weekday] : row.weekdays.filter(value => value !== weekday) })}/>{day}</label>)}</fieldset>}
      {row.frequency !== "none" && <label>Repeat through (optional)<input type="date" min={row.startDay} value={row.until} onChange={event => update(index, { until: event.target.value })}/><small>Includes this date. Leave blank to keep repeating.</small></label>}
      <button className="text-button" type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove time slot {index + 1}</button>
    </fieldset>)}
    <button className="secondary" type="button" disabled={rows.length >= 20} onClick={() => onChange([...rows, newScheduleDraft(timeZone)])}>Add time slot</button>
  </div>;
}

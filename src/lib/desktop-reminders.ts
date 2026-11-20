import { expandCalendar, shiftDay, zonedDay, zonedInstant, type CalendarSnapshot } from "./calendar.ts";
import type { Task } from "./tasks.ts";
export type DesktopReminder = { id: string; title: string; body: string; taskId?: string; day?: string };
export function desktopReminders(tasks: Task[], snapshot: CalendarSnapshot, now: number, lead: number): DesktopReminder[] {
  const day = zonedDay(now, snapshot.timeZone), tomorrow = shiftDay(day, 1);
  const result: DesktopReminder[] = [];
  for (const occurrence of expandCalendar(snapshot, now - 86400000, now + 86400000)) {
    const task = tasks.find(t => t.id === occurrence.task.id);
    if (occurrence.done || task?.done || (occurrence.workspace !== "Calendar" && !task)) continue;
    if (now < occurrence.start - lead * 60000 || now >= occurrence.start + 60000) continue;
    result.push({ id: `plan:${occurrence.id}:${occurrence.start}`, title: occurrence.task.title,
      body: `Scheduled ${new Intl.DateTimeFormat("en", {timeZone:snapshot.timeZone,hour:"numeric",minute:"2-digit"}).format(occurrence.start)}. ${occurrence.start > now ? "Starting soon." : "Starting now."}`,
      taskId: task?.id, day: zonedDay(occurrence.start, snapshot.timeZone) });
  }
  if (now >= zonedInstant(day, "09:00", snapshot.timeZone)) {
    const due = tasks.filter(t => !t.done && t.due && t.due <= tomorrow);
    if (due.length) result.push({id:`deadlines:${day}`, title:"LifeOS deadline reminders", body:due.slice(0,3).map(t=>`${t.title}: ${t.due < day ? "overdue" : t.due === day ? "due today" : "due tomorrow"}`).join("\n") + (due.length>3 ? `\n+${due.length-3} more` : ""),taskId:due.length===1?due[0].id:undefined});
  }
  return result;
}

import { z } from "zod";
import { calendarCommandSchema, calendarSnapshotSchema, expandCalendar } from "@/lib/calendar";
import { calendarClient, calendarDatabaseError } from "@/lib/calendar-server";
import { failure, json, readBody } from "@/lib/server-api";

export async function GET(request: Request) {
  try {
    const client = await calendarClient(request);
    const query = new URL(request.url).searchParams;
    const from = z.coerce.number().finite().nonnegative().parse(query.get("from") ?? Date.now() - 7 * 86400000);
    const to = z.coerce.number().finite().positive().parse(query.get("to") ?? Date.now() + 7 * 86400000);
    z.number().positive().max(367 * 86400000).parse(to - from);
    const { data, error } = await client.rpc("lifeos_calendar_load");
    if (error) throw calendarDatabaseError(error);
    const snapshot = calendarSnapshotSchema.parse(data);
    return json({ ...snapshot, occurrences: expandCalendar(snapshot, from, to) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const command = calendarCommandSchema.parse(await readBody(request));
    const client = await calendarClient(request);
    const { data, error } = await client.rpc("lifeos_calendar_mutate", { p_command: command });
    if (error) throw calendarDatabaseError(error);
    return json(calendarSnapshotSchema.parse(data));
  } catch (error) { return failure(error); }
}

import "server-only";
import { AppError, authenticatedClient, databaseError } from "@/lib/server-api";

export async function calendarClient(request: Request) {
  const verified = await authenticatedClient();
  if (request.headers.get("x-lifeos-account") !== verified.userId) throw new AppError(401, "account_changed", "Account changed. Please log in again.");
  return verified.client;
}

export function calendarDatabaseError(error: { code?: string }) {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code || "")) return new AppError(503, "calendar_setup", "Calendar setup is required. Apply the LifeOS V2 backend setup in Supabase, then retry.");
  if (error.code === "22023" || error.code === "23514") return new AppError(400, "validation", "The calendar entry is invalid, or its task is unavailable. Reload and review the details.");
  return databaseError(error);
}

export function taskScheduleDatabaseError(error: { code?: string }) {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code || "")) return new AppError(503, "task_schedules_setup", "Task scheduling setup is required. Install the task-schedules migration. Your unsaved form has been kept.");
  return calendarDatabaseError(error);
}

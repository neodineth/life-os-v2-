import { z } from "zod";
import { normalizeProgress, type Task } from "./tasks.ts";
import { plannedBlockSchema } from "./calendar.ts";

import { workspaceIdSchema, customWorkspaceSchema, workspaceNameSchema } from "./workspaces.ts";
export { workspaceNames } from "./workspaces.ts";
const date = z.string().refine(v => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v), "Invalid date");
const id = z.string().min(1).max(160);
const progressSchema = z.object({
  total: z.number().int().min(1).max(1000000), completed: z.number().int().min(0), unit: z.string().trim().min(1).max(30),
  completedRanges: z.array(z.tuple([z.number().int().min(1), z.number().int().min(1)])).optional(),
  names: z.record(z.string(), z.string().trim().max(120)).optional(),
}).strict().superRefine((p, ctx) => {
  if (p.completed > p.total || p.completedRanges?.some(([a,b]) => a > b || b > p.total) || Object.keys(p.names || {}).some(k => !/^\d+$/.test(k) || Number(k) < 1 || Number(k) > p.total)) ctx.addIssue({ code: "custom", message: "Invalid level progress" });
});
export const taskSchema = z.object({
  id, title: z.string().trim().min(1).max(180), workspace: workspaceIdSchema,
  due: date, start: date, focus: date, priority: z.enum(["High", "Medium", "Low"]),
  done: z.boolean(), repeat: z.enum(["None", "Daily", "Weekly", "Monthly"]),
  completedAt: z.string().refine(v => !Number.isNaN(Date.parse(v)), "Invalid completion date").optional(),
  progress: progressSchema.optional(), recurrenceParentId: id.optional(),
  completionMode: z.enum(["task", "occurrence"]).optional(),
}).strict().superRefine((task, ctx) => {
  if (task.start && task.due && task.start > task.due) ctx.addIssue({ code: "custom", message: "Start date must be before the deadline" });
  if (task.completionMode === "occurrence" && task.repeat !== "None") ctx.addIssue({ code: "custom", message: "Scheduled tasks cannot repeat after completion" });
}).transform((task): Task => {
  const progress = normalizeProgress(task.progress);
  return { ...task, progress, done: task.completionMode === "occurrence" ? task.done : progress ? progress.completed === progress.total : task.done };
});
export const snapshotSchema = z.object({ tasks: z.array(taskSchema), versions: z.record(z.string(), z.number().int().positive()), playerName: z.string().max(50), workspaceLabels: z.record(z.string(), z.string()).optional(), workspaceIds: z.array(workspaceIdSchema).optional(), workspaceCreateReady: z.boolean().optional(), workspaceVersions: z.record(z.string(), z.number().int().positive()).optional() });
export type CloudSnapshot = z.infer<typeof snapshotSchema>;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create-workspace"), workspace: customWorkspaceSchema, name: workspaceNameSchema }).strict(),
  z.object({ type: z.literal("rename-workspace"), workspace: workspaceIdSchema, name: z.string().trim().min(1).max(50), expectedVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("save"), task: taskSchema, expectedVersion: z.number().int().positive().nullable(), today: date.refine(Boolean), nextId: z.uuid() }).strict(),
  z.object({ type: z.literal("save-scheduled"), task: taskSchema, expectedVersion: z.number().int().positive().nullable(), operationId: z.uuid(), blocks: z.array(plannedBlockSchema).max(20), scheduleVersions: z.record(z.string(), z.number().int().positive()) }).strict(),
  z.object({ type: z.literal("delete"), id, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("import"), tasks: z.array(taskSchema).min(1).max(5000) }).strict(),
]);
export type CloudCommand = z.infer<typeof commandSchema>;
export const emailSchema = z.email().trim().max(254);
const password = z.string().min(8, "Use at least 8 characters").max(128);
export const authSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), email: emailSchema, password: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal("signup"), email: emailSchema, password, confirmation: z.string(), playerName: z.string().trim().max(50).optional() }).strict(),
  z.object({ action: z.literal("recover"), email: emailSchema }).strict(),
  z.object({ action: z.literal("reset"), password, confirmation: z.string() }).strict(),
  z.object({ action: z.literal("logout") }).strict(),
]).superRefine((v, ctx) => {
  if ((v.action === "signup" || v.action === "reset") && v.password !== v.confirmation) ctx.addIssue({ code: "custom", message: "Passwords do not match" });
});
export function legacyTasks(raw: string): Task[] {
  return z.array(taskSchema).max(5000).parse(JSON.parse(raw));
}
export function safeNext(value: string | null) { return value === "/reset-password" ? "/reset-password" : "/"; }

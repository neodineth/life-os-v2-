import { chatRequestSchema } from "@/lib/chat";
import { snapshotSchema } from "@/lib/cloud-model";
import { geminiConfig, geminiReply } from "@/lib/gemini";
import { AppError, authenticatedClient, databaseError, failure, json, readBody } from "@/lib/server-api";

const limits = new Map<string, { count: number; reset: number }>();
function reserveRequest(userId: string) {
  const now = Date.now();
  for (const [id, limit] of limits) if (limit.reset <= now) limits.delete(id);
  const limit = limits.get(userId);
  if (limit && limit.count >= 5) throw new AppError(429, "ai_rate_limit", "Please wait a minute before sending more messages.");
  if (!limit && limits.size >= 1000) throw new AppError(503, "ai_busy", "Chat is busy. Please try again shortly.");
  limits.set(userId, { count: (limit?.count || 0) + 1, reset: limit?.reset || now + 60000 });
}

async function chatClient(request: Request) {
  const verified = await authenticatedClient();
  if (request.headers.get("x-lifeos-account") !== verified.userId) throw new AppError(401, "account_changed", "Account changed. Please log in again.");
  return verified;
}

export async function GET(request: Request) {
  try {
    await chatClient(request);
    const { key, model } = geminiConfig();
    return json({ configured: !!key, model });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 100000) throw new AppError(413, "size", "This message is too large.");
    const input = chatRequestSchema.parse(await readBody(request));
    const { client, userId } = await chatClient(request);
    if (!geminiConfig().key) throw new AppError(503, "ai_setup", "Gemini is not connected yet. Add GEMINI_API_KEY to the server settings and restart the app.");
    reserveRequest(userId);
    let context = "No account task context was shared.";
    if (input.includeTasks) {
      const { data, error } = await client.rpc("lifeos_load");
      if (error) throw databaseError(error);
      const tasks = snapshotSchema.parse(data).tasks.filter(task => !task.done);
      const selected = tasks.slice(0, 80).map(task => ({ title: task.title, workspace: task.workspace, due: task.due, priority: task.priority, ...(task.progress ? { completed: task.progress.completed, total: task.progress.total, unit: task.progress.unit } : {}) }));
      context = `Current instant: ${new Date().toISOString()}. Pending tasks (${tasks.length} total; showing up to 80):\n${JSON.stringify(selected)}\nEnd of task data.`;
    }
    return json(await geminiReply(input.messages, context));
  } catch (error) { return failure(error); }
}

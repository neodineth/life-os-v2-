import { commandSchema, snapshotSchema } from "@/lib/cloud-model";
import { saveTask } from "@/lib/tasks";
import { AppError, authenticatedClient, databaseError, failure, json, readBody } from "@/lib/server-api";
import { taskScheduleDatabaseError } from "@/lib/calendar-server";

export async function GET(request: Request) {
  try {
    const { client, userId } = await authenticatedClient();
    if(request.headers.get("x-lifeos-account")!==userId)throw new AppError(401,"account_changed","Account changed. Please log in again.");
    const { data, error } = await client.rpc("lifeos_load");
    if (error) throw databaseError(error);
    return json(snapshotSchema.parse(data));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const command = commandSchema.parse(await readBody(request));
    const { client, userId } = await authenticatedClient();
    if(request.headers.get("x-lifeos-account")!==userId)throw new AppError(401,"account_changed","Account changed. Please log in again.");
    let result;
    if (command.type === "save-scheduled") {
      const saved = await client.rpc("lifeos_task_schedule_save", { p_command: command });
      if (saved.error) throw taskScheduleDatabaseError(saved.error);
      return json(snapshotSchema.parse(saved.data));
    }
    if (command.type === "import") result = await client.rpc("lifeos_import", { p_tasks: command.tasks });
    else if (command.type === "delete") result = await client.rpc("lifeos_delete", { p_id: command.id, p_expected_version: command.expectedVersion });
    else {
      const current = await client.rpc("lifeos_load");
      if (current.error) throw databaseError(current.error);
      const snapshot = snapshotSchema.parse(current.data);
      if ((snapshot.versions[command.task.id] ?? null) !== command.expectedVersion) throw databaseError({ code: "40001" });
      const changed = saveTask(snapshot.tasks,command.task,command.today,command.nextId);
      const successor = changed.find(t => t.id === command.nextId);
      const task = changed.find(t => t.id === command.task.id);
      result = command.task.completionMode === "occurrence" ? await client.rpc("lifeos_scheduled_task_update", { p_task: task, p_expected_version: command.expectedVersion }) : await client.rpc("lifeos_commit", { p_task: task, p_expected_version: command.expectedVersion, p_successor: successor || null });
    }
    if (result.error) throw (command.type === "save" && command.task.completionMode === "occurrence" ? taskScheduleDatabaseError(result.error) : databaseError(result.error));
    return json(snapshotSchema.parse(result.data));
  } catch (error) { return failure(error); }
}

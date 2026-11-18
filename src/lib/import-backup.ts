import { legacyTasks } from "./cloud-model.ts";
import type { Task } from "./tasks.ts";
export const LEGACY_KEY = "lifeos.tasks.v1";
export const IMPORT_OWNER_KEY = "lifeos.import.owner.v1";
export async function readLegacyBackup(storage: Pick<Storage,"getItem">, userId: string): Promise<{tasks:Task[];fingerprint:string}> {
  const owner=storage.getItem(IMPORT_OWNER_KEY);
  if (owner && owner!==userId) return {tasks:[],fingerprint:""};
  const raw=storage.getItem(LEGACY_KEY);
  if (!raw) return {tasks:[],fingerprint:""};
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  const fingerprint=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
  if (storage.getItem(`lifeos.import.snapshot.${userId}`)===fingerprint) return {tasks:[],fingerprint};
  return {tasks:legacyTasks(raw),fingerprint};
}
export function markLegacyImported(storage: Pick<Storage,"getItem"|"setItem">,userId:string,fingerprint:string) {
  const owner=storage.getItem(IMPORT_OWNER_KEY);
  if (owner && owner!==userId) throw new Error("This backup belongs to another account.");
  storage.setItem(IMPORT_OWNER_KEY,userId);
  storage.setItem(`lifeos.import.snapshot.${userId}`,fingerprint);
}

import "server-only";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSameOriginRequest } from "@/lib/request-origin";
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }); }
export async function readBody(request: Request) {
  if (!isSameOriginRequest(request)) throw new AppError(403, "origin", "Request not allowed.");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "format", "JSON is required.");
  const max = 10 * 1024 * 1024;
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400,"body","Request body is missing.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > max) { await reader.cancel(); throw new AppError(413,"size","This import is too large."); }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes); let offset=0;
  for (const chunk of chunks) { body.set(chunk,offset); offset+=chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new AppError(400,"body","Invalid JSON."); }
}
export async function authenticatedClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  if (error && (error.status === 0 || (error.status || 0) >= 500)) throw new AppError(503,"auth_unavailable","Sign-in service is unavailable. Try again.");
  if (error || !data?.claims?.sub) throw new AppError(401,"unauthenticated","Please log in again.");
  return { client, userId: data.claims.sub };
}
export function failure(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message, code: error.code },error.status);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message || "Invalid input.", code: "validation" },400);
  return json({ error: "The service is unavailable. Please retry.", code: "unavailable" },503);
}
export function databaseError(error: { code?: string }) {
  if (error.code === "40001" || error.code === "23505") return new AppError(409,"conflict","Changed on another device. Reloaded; review and try again.");
  if (["PGRST202","PGRST205","42P01","42883"].includes(error.code || "")) return new AppError(503,"setup","Cloud database setup is incomplete. Apply the account migration.");
  if (error.code === "42501" || error.code === "PGRST301") return new AppError(401,"unauthenticated","Please log in again.");
  if (error.code === "22023" || error.code === "23514") return new AppError(400,"validation","Task data is invalid. Review the fields.");
  return new AppError(503,"save_failed","Save could not be confirmed. Retry to check its status.");
}

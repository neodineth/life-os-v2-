import { z } from "zod";
import { treeSchema } from "@/lib/tree";
import { calendarClient } from "@/lib/calendar-server";
import { AppError, databaseError, failure, json, readBody } from "@/lib/server-api";
function check(error:{code?:string}) {
 if(["PGRST202","42P01","42883","PGRST205"].includes(error.code||"")) throw new AppError(503,"tree_setup","Tree saving needs setup. Run LifeOS-V2-Tree-Canvas.sql in Supabase, then click Retry. Your browser draft is kept.");
 throw databaseError(error);
}
export async function GET(request:Request) {
 try {const client=await calendarClient(request);const {data,error}=await client.rpc("lifeos_tree_load");if(error) check(error);return json(data);}catch(error){return failure(error);}
}
export async function POST(request:Request) {
 try {const body=z.object({document:treeSchema,expectedVersion:z.number().int().nonnegative(),mutationId:z.string().uuid()}).strict().parse(await readBody(request));
 const client=await calendarClient(request);const {data,error}=await client.rpc("lifeos_tree_save",{p_document:body.document,p_expected_version:body.expectedVersion,p_mutation_id:body.mutationId});if(error)check(error);return json(data);
 }catch(error){return failure(error);}
}

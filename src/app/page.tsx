import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import Workspace from "@/components/workspace";
import { AppError, authenticatedClient } from "@/lib/server-api";
import { isSupabaseConfigured } from "@/lib/supabase/config";
async function AccountWorkspace() {
  await connection();
  if (!isSupabaseConfigured()) return <div className="empty"><h1>Setup required</h1><p>Add the Supabase environment settings to enable accounts.</p></div>;
  let userId: string;
  try { ({ userId } = await authenticatedClient()); }
  catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError && error.status===401) redirect("/login");
    return <div className="empty"><h1>Connection unavailable</h1><p>Reload to try again.</p></div>;
  }
  return <Workspace key={userId} userId={userId}/>;
}
export default function Home() { return <Suspense fallback={<div className="empty">Connecting…</div>}><AccountWorkspace/></Suspense>; }

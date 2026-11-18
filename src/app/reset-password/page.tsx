import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth-form";
import { AppError, authenticatedClient } from "@/lib/server-api";
async function ResetForm() {
  await connection();
  try { await authenticatedClient(); } catch (error) {
    unstable_rethrow(error);
    if(error instanceof AppError && error.status===401)redirect("/login?error=link_expired");
    return <div className="empty"><h1>Connection unavailable</h1><p>Reload to try again.</p></div>;
  }
  return <AuthForm mode="reset"/>;
}
export default function Reset() { return <Suspense fallback={<div className="empty">Loading…</div>}><ResetForm/></Suspense>; }

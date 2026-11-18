"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { snapshotSchema, type CloudCommand, type CloudSnapshot } from "@/lib/cloud-model";
import type { Task } from "@/lib/tasks";

import { readLegacyBackup, markLegacyImported } from "@/lib/import-backup";
class CloudError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export function useCloudWorkspace(userId: string) {
  const [snapshot, setSnapshot] = useState<CloudSnapshot>({ tasks: [], versions: {}, playerName: "Player one" });
  const snapshotRef = useRef(snapshot);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const legacyFingerprint=useRef("");
  const [legacy, setLegacy] = useState<Task[]>([]);
  const [retryCommand, setRetryCommand] = useState<CloudCommand | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const suppressedCelebration = useRef(true);
  const consumeCelebrationSuppression = useCallback(() => {
    const suppressed = suppressedCelebration.current;
    suppressedCelebration.current = false;
    return suppressed;
  }, []);
  const accept = useCallback((value: CloudSnapshot) => { snapshotRef.current=value; setSnapshot(value); }, []);
  const clear = useCallback(() => {
    generation.current++;
    accept({ tasks: [], versions: {}, playerName: "Player one" }); setLegacy([]); setReady(false); setRetryCommand(null);
    window.location.replace("/login");
  }, [accept]);
  const request = useCallback(async (command?: CloudCommand) => {
    const response = await fetch("/api/workspace", command ? { method: "POST", headers: { "Content-Type": "application/json", "X-LifeOS-Account": userId }, body: JSON.stringify(command), cache: "no-store" } : { cache: "no-store", headers:{"X-LifeOS-Account":userId} });
    const result = await response.json();
    if (!response.ok) throw new CloudError(response.status,result.code,result.error || "Cloud request failed.");
    return snapshotSchema.parse(result);
  }, [userId]);
  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current=true; setBusy(true); const current=generation.current;
    try {
      const result=await request();
      if (!mounted.current || current!==generation.current) return;
      suppressedCelebration.current=true; accept(result); setReady(true); setError("");
    } catch (e) {
      if (!mounted.current || current!==generation.current) return;
      if (e instanceof CloudError && e.status===401) { clear(); return; }
      setError(e instanceof CloudError ? e.message : "Cloud tasks could not load. Retry.");
    } finally { if (mounted.current && current===generation.current) { busyRef.current=false; setBusy(false); } }
  }, [accept, clear, request]);
  useEffect(() => {
    mounted.current=true; generation.current++; busyRef.current=false;
    const current=generation.current;
    void readLegacyBackup(localStorage,userId).then(backup=>{
      if (mounted.current && generation.current===current) {setLegacy(backup.tasks);legacyFingerprint.current=backup.fingerprint;}
    }).catch(()=>{if(mounted.current && generation.current===current)setError("Browser backup could not be read. It has not been changed.");});
    queueMicrotask(() => { if (mounted.current && generation.current === current) void load(); });
    const focus=() => { if (document.visibilityState==="visible") void load(); };
    window.addEventListener("focus",focus);
    document.addEventListener("visibilitychange",focus);
    const channel = typeof BroadcastChannel!=="undefined" ? new BroadcastChannel("lifeos-auth") : null;
    if (channel) channel.onmessage=event=>{if(event.data==="signed-out")clear();};
    const client=createClient();
    const { data: subscription } = client.auth.onAuthStateChange((event,session) => {
      if (event==="SIGNED_OUT" || (session && session.user.id!==userId)) clear();
    });
    const invalidate = () => { generation.current++; };
    return () => { mounted.current=false; invalidate(); window.removeEventListener("focus",focus); document.removeEventListener("visibilitychange",focus); channel?.close(); subscription.subscription.unsubscribe(); };
  }, [userId, load, clear]);
  const commit = async (command: CloudCommand) => {
    if (busyRef.current || !ready) return false;
    busyRef.current=true; setBusy(true); setError(""); setRetryCommand(null); const current=generation.current;
    try {
      const value=await request(command);
      if (!mounted.current || current!==generation.current) return false;
      suppressedCelebration.current=command.type==="import"; accept(value);
      window.dispatchEvent(new Event("lifeos-calendar-change"));
      if (command.type==="import") {
        try { markLegacyImported(localStorage,userId,legacyFingerprint.current); setLegacy([]); }
        catch { setError("Imported. The browser owner marker could not be saved; repeat imports still skip duplicates."); }
      }
      return true;
    } catch (e) {
      if (!mounted.current || current!==generation.current) return false;
      if (e instanceof CloudError && e.status===401) { clear(); return false; }
      if (e instanceof CloudError && e.status===409) {
        try { const latest=await request(); if (current===generation.current && mounted.current) { suppressedCelebration.current=true; accept(latest); } } catch { /* Keep the last confirmed snapshot. */ }
        setError(command.type === "save-scheduled" ? "Changed on another device. Your draft is preserved; close and reopen the editor to load the latest task and schedules." : "Changed on another device. Reloaded; review and try again.");
      } else {
        setRetryCommand(command);
        setError(e instanceof CloudError ? e.message : "Connection lost. Retry to check save status.");
      }
      return false;
    } finally { if (mounted.current && current===generation.current) { busyRef.current=false; setBusy(false); } }
  };
  const logout = async () => {
    if (busyRef.current) return;
    busyRef.current=true; setBusy(true); setError("");
    try {
      const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});
      if (!response.ok) throw new Error("Logout failed. Please retry.");
      const channel=typeof BroadcastChannel!=="undefined" ? new BroadcastChannel("lifeos-auth") : null;
      channel?.postMessage("signed-out"); channel?.close(); clear();
    } catch(e) { setError(e instanceof Error ? e.message : "Logout failed."); busyRef.current=false; setBusy(false); }
  };
  return { ...snapshot, snapshotRef, ready, busy, error, legacy, commit, load, logout, consumeCelebrationSuppression,
    retry: retryCommand ? () => commit(retryCommand) : null,
    importLegacy: () => commit({type:"import",tasks:legacy}),
  };
}

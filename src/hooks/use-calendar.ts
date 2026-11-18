"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calendarSnapshotSchema, DEFAULT_TIME_ZONE, type CalendarCommand, type CalendarSnapshot } from "@/lib/calendar";

export function useCalendar(userId: string, from: number, to: number) {
  const [snapshot, setSnapshot] = useState<CalendarSnapshot>({ timeZone: DEFAULT_TIME_ZONE, blocks: [], exceptions: [], versions: {} });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryCommand, setRetryCommand] = useState<CalendarCommand | null>(null);
  const generation = useRef(0), mounted = useRef(false), writing = useRef(false);
  const mutationError = useRef("");
  const request = useCallback(async (command?: CalendarCommand) => {
    const response = await fetch(command ? "/api/calendar" : `/api/calendar?from=${from}&to=${to}`, {
      method: command ? "POST" : "GET", headers: { "X-LifeOS-Account": userId, ...(command ? { "Content-Type": "application/json" } : {}) },
      ...(command ? { body: JSON.stringify(command) } : {}), cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "Calendar could not load. Retry."), { status: response.status });
    return calendarSnapshotSchema.parse(data);
  }, [userId, from, to]);
  const load = useCallback(async () => {
    if (writing.current) return;
    const current = ++generation.current;
    try { const data = await request(); if (mounted.current && current === generation.current) { setSnapshot(data); setReady(true); if (!mutationError.current) setError(""); } }
    catch (error) { if (mounted.current && current === generation.current) setError(error instanceof Error ? error.message : "Calendar could not load."); }
  }, [request]);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) void load(); });
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); window.addEventListener("lifeos-calendar-change", refresh);
    const invalidate = () => { generation.current++; };
    return () => { mounted.current = false; invalidate(); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("lifeos-calendar-change", refresh); };
  }, [load]);
  const commit = async (command: CalendarCommand) => {
    if (!ready || writing.current) return false;
    writing.current = true; generation.current++; mutationError.current = ""; setBusy(true); setError(""); setRetryCommand(null);
    try {
      const data = await request(command);
      if (!mounted.current) return false;
      setSnapshot(data); window.dispatchEvent(new Event("lifeos-calendar-change")); return true;
    } catch (error) {
      if (!mounted.current) return false;
      if ((error as { status?: number }).status === 409) {
        try { setSnapshot(await request()); } catch { /* Preserve the confirmed snapshot. */ }
        mutationError.current = "Changed on another device. The calendar has reloaded; reopen the block and review your change.";
        setError(mutationError.current);
      } else { setRetryCommand(command); mutationError.current = error instanceof Error ? error.message : "Calendar save failed. Retry."; setError(mutationError.current); }
      return false;
    } finally { writing.current = false; if (mounted.current) setBusy(false); }
  };
  const clearError = () => { mutationError.current = ""; setRetryCommand(null); setError(""); };
  return { ...snapshot, ready, busy, error, commit, load, clearError, retry: retryCommand ? () => commit(retryCommand) : null };
}

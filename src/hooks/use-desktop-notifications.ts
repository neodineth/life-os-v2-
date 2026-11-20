"use client";
import { useEffect, useRef, useState } from "react";
import { calendarSnapshotSchema } from "@/lib/calendar";
import { desktopReminders, type DesktopReminder } from "@/lib/desktop-reminders";
import type { Task } from "@/lib/tasks";

type Settings = { enabled: boolean; lead: number };
export function useDesktopNotifications(userId: string, tasks: Task[], ready: boolean, onOpen: (item: DesktopReminder) => void) {
  const key = `lifeos.desktop.v1:${userId}`;
  const [settings, setSettings] = useState<Settings>({ enabled:false, lead:10 });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const latest = useRef({ tasks, onOpen });
  useEffect(() => { latest.current = { tasks, onOpen }; }, [tasks, onOpen]);
  const active = useRef(new Set<Notification>());
  useEffect(() => {
    const sync = () => {
      setPermission(typeof Notification === "undefined" || !window.isSecureContext ? "unsupported" : Notification.permission);
      try { const saved = JSON.parse(localStorage.getItem(key) || "{}"); setSettings({enabled:saved.enabled===true,lead:[0,5,10,15,30].includes(saved.lead)?saved.lead:10}); }
      catch { setError("Browser storage is unavailable. Reminders cannot safely remember delivery status."); }
    };
    const timer = setTimeout(sync,0);
    window.addEventListener("storage",sync); window.addEventListener("focus",sync);
    const notifications = active.current;
    return () => {clearTimeout(timer);window.removeEventListener("storage",sync);window.removeEventListener("focus",sync);notifications.forEach(n=>n.close());notifications.clear();};
  }, [key]);
  function update(next: Settings) {
    try { localStorage.setItem(key,JSON.stringify(next));setSettings(next);setError(""); }
    catch {setError("Could not save notification settings in this browser.");}
  }
  function show(item: DesktopReminder) {
    const n = new Notification(item.title,{body:item.body,tag:`${userId}:${item.id}`});
    active.current.add(n);
    n.onclose=()=>active.current.delete(n);
    n.onclick=()=>{window.focus();n.close();latest.current.onOpen(item);};
    n.onerror=()=>setError("The browser could not display a notification. Check browser and Windows notification settings.");
  }
  async function enable() {
    if (typeof Notification === "undefined" || !window.isSecureContext) {setPermission("unsupported");return;}
    setRequesting(true);setError("");
    try {
      const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setPermission(result);
      if(result === "granted") {update({...settings,enabled:true});show({id:"test",title:"LifeOS notifications enabled",body:"Task reminders will appear here while LifeOS is open."});}
    } catch {setError("Could not enable desktop notifications. Try opening LifeOS directly in your desktop browser.");}
    finally {setRequesting(false);}
  }
  function test() { try {show({id:"test",title:"LifeOS test notification",body:"Desktop notifications are working. Click to open reminders."});} catch {setError("Notification delivery failed. Check your browser permissions and Windows Do not disturb settings.");} }
  useEffect(() => {
    if (!ready || !settings.enabled || permission !== "granted") return;
    let stopped=false, failures=0, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const notifications = active.current;
    const tick = async () => {
      try {
        const run = async () => {
          if(stopped || Notification.permission !== "granted") return;
          const currentSettings=JSON.parse(localStorage.getItem(key)||"{}");
          if(!currentSettings.enabled) return;
          const now=Date.now();
          const response=await fetch(`/api/calendar?from=${now-86400000}&to=${now+86400000}`,{headers:{"X-LifeOS-Account":userId},cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
          if(!response.ok) throw new Error("Reminders could not refresh calendar data. Retrying automatically.");
          const snapshot=calendarSnapshotSchema.parse(await response.json());
          if(stopped) return;
          const stored=JSON.parse(localStorage.getItem(`${key}:sent`)||"{}");
          const sent: Record<string,number> = Object.fromEntries(Object.entries(stored).filter((pair): pair is [string,number]=>typeof pair[1]==="number" && pair[1]>now-7*86400000));
          const pending=desktopReminders(latest.current.tasks,snapshot,now,settings.lead).filter(item=>!sent[item.id]);
          // One summary avoids a burst after opening the app or waking the computer.
          if(pending.length) {
            const item=pending.length===1?pending[0]:{id:`summary:${now}`,title:`LifeOS: ${pending.length} reminders`,body:pending.slice(0,3).map(i=>i.title).join("\n")};
            pending.forEach(i=>{sent[i.id]=now;});
            localStorage.setItem(`${key}:sent`,JSON.stringify(sent));
            try { show(item); } catch(e) {pending.forEach(i=>{delete sent[i.id];});localStorage.setItem(`${key}:sent`,JSON.stringify(sent));throw e;}
          }
          failures=0;setError("");
        };
        if(navigator.locks) await navigator.locks.request(`${key}:delivery`,{ifAvailable:true},async lock=>{if(lock) await run();});
        else await run();
      } catch(e) {if(!stopped){failures++;setError(e instanceof Error?e.message:"Reminder check failed.");}}
      finally {if(!stopped) timer=setTimeout(tick,Math.min(600000,60000*2**Math.min(failures,4)));}
    };
    timer=setTimeout(tick,1000);
    return ()=>{stopped=true;clearTimeout(timer);controller.abort();notifications.forEach(n=>n.close());notifications.clear();};
    // Delivery callbacks read the latest task snapshot without restarting the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key,userId,ready,settings.enabled,settings.lead,permission]);
  return {settings,permission,error,requesting,enable,test,disable:()=>update({...settings,enabled:false}),setLead:(lead:number)=>update({...settings,lead})};
}

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { createPortal } from "react-dom";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ArrowDownToLine, ArrowRight, Bell, BookOpen, CalendarDays, ChevronRight, Flag, Gamepad2, GraduationCap, LayoutDashboard, Leaf, LogOut, Menu, Pencil, Plus, Rocket, Search, Star, Trophy, X, Zap } from "lucide-react";
import { playerStats, progressPercent, setCompletedCount, type Task } from "@/lib/tasks";
import { ProgressBar, TaskDetail } from "@/components/task-detail";
import { TaskEditor } from "@/components/task-editor";
import { GameDialog } from "@/components/game-dialog";
import { useCloudWorkspace } from "@/hooks/use-cloud-workspace";
import { focusHistorySchema, type FocusSession } from "@/lib/focus";
import { DEFAULT_TIME_ZONE } from "@/lib/calendar";
import { FocusCalendar } from "@/components/focus-calendar";
import { AIChat } from "@/components/ai-chat";

const workspaces = ["University 01", "University 02", "Startup 01", "Startup 02", "Personal Growth"];
const colors = ["#99ffd1", "#58d4f5", "#f7be63", "#ed8fc1", "#77e9b4"];
const icons = [GraduationCap, BookOpen, Rocket, Rocket, Leaf];
const localDay = (zone: string) => format(TZDate.tz(zone), "yyyy-MM-dd");

type Celebration = { id: number; message: string; level?: number; quest: boolean };
export default function Workspace({ userId }: { userId: string }) {
  const cloud = useCloudWorkspace(userId);
  const { tasks, ready, busy, consumeCelebrationSuppression } = cloud;
  const [savedFocus, setSavedFocus] = useState<FocusSession[]>([]);
  useEffect(() => {
    // Read the existing backup without starting camera tracking or cloud sync.
    try {
      const records = focusHistorySchema.parse(JSON.parse(localStorage.getItem(`lifeos.focus.v1:${userId}`) || "[]"));
      queueMicrotask(() => setSavedFocus(records));
    } catch { /* Preserve an unreadable backup without modifying it. */ }
  }, [userId]);
  const [editorVersion, setEditorVersion] = useState<number | null>(null);

  const [workspaceEdit, setWorkspaceEdit] = useState<{ id: string; name: string; version: number } | null>(null);
  const label = (id: string) => cloud.workspaceLabels?.[id] || id;
  const [message, setMessage] = useState("");
  const [view, setView] = useState("Dashboard");
  const [filter, setFilter] = useState("All tasks");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Task | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [today, setToday] = useState("");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const previousTasks = useRef<Task[] | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const initial = setTimeout(() => setToday(localDay(DEFAULT_TIME_ZONE)), 0);
    const timer = setInterval(() => setToday(localDay(DEFAULT_TIME_ZONE)), 60000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const previous = previousTasks.current;
    previousTasks.current = tasks;
    if (consumeCelebrationSuppression()) return;
    if (!previous) return;
    const before = playerStats(previous);
    const after = playerStats(tasks);
    const finished = tasks.find(t => t.done && previous.some(old => old.id === t.id && !old.done));
    const levelUp = after.level > before.level;
    if (finished || levelUp) {
      const next = { id: ++sequence.current, message: finished ? "Quest cleared" : "Level up", level: levelUp ? after.level : undefined, quest: !!finished };
      const timer = setTimeout(() => setCelebration(next), 0);
      return () => clearTimeout(timer);
    }
  }, [tasks, ready, consumeCelebrationSuppression]);
  useEffect(() => {
    if (!celebration) return;
    const timeout = setTimeout(() => setCelebration(null), 2800);
    return () => clearTimeout(timeout);
  }, [celebration]);

  const editorNotice = editor && (cloud.versions[editor.id] ?? null) !== editorVersion
    ? "Changed elsewhere. Your draft is preserved. Close and reopen the editor to load the latest version before saving."
    : "";
  const stats = playerStats(tasks);
  const days = (due: string) => due && today ? differenceInCalendarDays(parseISO(due), parseISO(today)) : Infinity;
  const pending = tasks.filter(t => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const focus = pending.filter(t => t.focus === today);
  const reminders = pending.filter(t => days(t.due) <= 3 || days(t.due) === 7 || (t.start && t.start <= today));
  const selected = tasks.find(t => t.id === selectedId);
  function navigate(v: string) { setView(v); setFilter("All tasks"); setMobile(false); }
  function openTask(id: string) { setSelectedId(id); setAlerts(false); }
  function openEditor(task: Task) { setEditorVersion(cloud.snapshotRef.current.versions[task.id] ?? null); setEditor(task); }
  function create() { setSelectedId(null); openEditor({ id: crypto.randomUUID(), title: "", workspace: workspaces.includes(view) ? view : workspaces[0], due: "", start: "", priority: "Medium", done: false, focus: "", repeat: "None" }); }
  async function persist(task: Task, expectedVersion: number | null) {
    return cloud.commit({type:"save",task,expectedVersion,today,nextId:crypto.randomUUID()});
  }
  async function updateTask(id: string, update: (task: Task) => Task) {
    const current=cloud.snapshotRef.current;
    const task=current.tasks.find(t=>t.id===id);
    return task ? persist(update(task),current.versions[id]) : false;
  }
  function toggle(id: string) {
    return updateTask(id, t => ({ ...t, done: !t.done, progress: t.completionMode === "occurrence" ? t.progress : t.progress ? setCompletedCount(t.progress, t.done ? t.progress.total - 1 : t.progress.total) : undefined }));
  }
  function pin(t: Task) {
    if (t.focus !== today && focus.length >= 3) { setMessage("Focus is full (3/3)."); return; }
    void updateTask(t.id,x=>({...x,focus:x.focus===today ? "" : today}));
  }
  async function retrySave() { if(cloud.retry && await cloud.retry())setEditor(null); }
  function exportTasks() {
    const link = document.createElement("a"); const url = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" }));
    link.href = url; link.download = `lifeos-${today}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const scoped = tasks.filter(t => (!workspaces.includes(view) || t.workspace === view) && t.title.toLowerCase().includes(search.toLowerCase()));
  const completedBelow = scoped.filter(t => t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const visible = scoped.filter(t => {
    if (view === "Completed") return t.done;
    if (t.done) return false;
    if (view === "Weekly review") return !t.due || days(t.due) < 0;
    if (filter === "Overdue") return days(t.due) < 0;
    if (filter === "Today") return t.due === today;
    if (filter === "Next 7 days") return days(t.due) > 0 && days(t.due) <= 7;
    if (filter === "Later") return days(t.due) > 7;
    if (filter === "Planned today") return t.focus === today;
    return true;
  }).sort((a, b) => {
    const aDays = days(a.due), bDays = days(b.due);
    return (aDays === bDays ? 0 : aDays - bDays) || a.title.localeCompare(b.title);
  });
  function deadline(t: Task) {
    return !t.due ? "No deadline" : !today ? t.due : days(t.due) === 0 ? "Due today" : days(t.due) < 0 ? `${Math.abs(days(t.due))} days overdue` : `${days(t.due)} ${days(t.due) === 1 ? "day" : "days"} left`;
  }
  function row(t: Task) {
    const color = colors[workspaces.indexOf(t.workspace)];
    const urgency = !t.due || !today ? "none" : days(t.due) <= 5 ? "high" : days(t.due) <= 10 ? "medium" : "low";
    return <article className={`quest-card ${t.done ? "is-done" : ""}`} key={t.id} style={{ "--quest-color": color } as CSSProperties} onClick={e => { if (e.target === e.currentTarget) openTask(t.id); }}>
      <button className="quest-open" onClick={() => openTask(t.id)} aria-label={`Open ${t.title}`}>
        <span className="quest-emblem">{t.done ? <Trophy size={22}/> : t.progress ? <Gamepad2 size={23}/> : <Flag size={21}/>}</span>
        <span className="quest-body"><span className="quest-title">{t.title}</span><span className="quest-workspace"><i style={{ background: color }}/>{label(t.workspace)}{t.repeat !== "None" && <span> · {t.repeat}</span>}</span>
          {t.progress ? <span className="card-progress"><span><b>{t.progress.completed}/{t.progress.total}</b> {t.progress.unit}<strong>{progressPercent(t.progress)}%</strong></span><ProgressBar progress={t.progress} title={t.title}/></span> : <span className="card-reward"><Zap size={11}/>50 XP</span>}
        </span>
      </button>
      <div className="quest-controls"><div className="quest-buttons">{!t.done && <button className={`icon-button star ${t.focus === today ? "selected" : ""}`} aria-label={`${t.focus === today ? "Unstar" : "Star"} ${t.title}`} disabled={busy} onClick={() => pin(t)}><Star size={16} fill={t.focus === today ? "currentColor" : "none"}/></button>}<button className="icon-button edit-task" aria-label={`Edit ${t.title}`} disabled={busy} onClick={() => openEditor(t)}><Pencil size={15}/></button></div><span className={`deadline-countdown ${t.done ? "none" : urgency}`}><strong>{t.done ? "Completed" : deadline(t)}</strong>{!t.done && urgency !== "none" && <small>{urgency} priority</small>}</span></div>
    </article>;
  }
  return <div className="app-shell">
    {mobile && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside className={`sidebar ${mobile ? "open" : ""}`}>
      <Link href="/" className="brand"><span className="brand-icon"><Gamepad2 size={25}/></span>LifeOS<span className="brand-dot">.</span></Link>
      <nav aria-label="Main navigation"><div className="nav-group">{[["Dashboard", LayoutDashboard], ["Calendar", CalendarDays], ["Weekly review", BookOpen], ["AI chat", Zap]].map(([name, Icon]) => { const NavIcon = Icon as typeof LayoutDashboard; return <button key={String(name)} className={`nav ${view === name ? "active" : ""}`} aria-current={view === name ? "page" : undefined} onClick={() => navigate(String(name))}><NavIcon size={18}/>{String(name)}</button>; })}</div>
        <p className="nav-label">WORKSPACES</p>
        {workspaces.map((w, i) => { const Icon = icons[i]; return <button key={w} className={`nav ${view === w ? "active" : ""}`} aria-current={view === w ? "page" : undefined} onClick={() => navigate(w)}><Icon size={18} color={colors[i]}/><span className="workspace-nav-name">{label(w)}</span><span className="nav-count">{pending.filter(t => t.workspace === w).length}</span></button>; })}
        <div className="nav-group bottom-nav"><button className={`nav ${view === "Completed" ? "active" : ""}`} onClick={() => navigate("Completed")}><Trophy size={18}/>Completed<span className="nav-count">{tasks.filter(t => t.done).length}</span></button></div>
      </nav>
      <div className="sidebar-bottom"><div className="player-card"><span className="player-avatar"><Gamepad2 size={20}/></span><div><strong>{cloud.playerName}</strong><span>Level {stats.level}</span></div><span className="online-dot"/></div><button className="export-button" onClick={exportTasks}><ArrowDownToLine size={14}/>Export</button><button className="export-button" disabled={busy} onClick={() => void cloud.logout()}><LogOut size={14}/>Logout</button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20}/></button><span>LifeOS</span><ChevronRight size={13}/><strong>{label(view)}</strong></div><div className="header-actions"><label className="search"><Search size={16}/><input aria-label="Search tasks" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)}/></label><button className="icon-button notification" aria-label="Open reminders" onClick={() => setAlerts(true)}><Bell size={18}/>{reminders.length > 0 && <i/>}</button></div></header>
      <main>
        <div className="page-heading"><div><span className="page-kicker"><span/>QUEST LOG</span><div className="workspace-title-row"><h1>{label(view)}</h1>{workspaces.includes(view) && <button className="icon-button workspace-rename" aria-label={`Rename ${label(view)}`} title="Rename workspace" disabled={!ready || busy} onClick={() => setWorkspaceEdit({ id: view, name: label(view), version: cloud.workspaceVersions?.[view] || 1 })}><Pencil size={16}/></button>}</div></div><button id="add-task" className="primary" onClick={create} disabled={!ready || busy}><Plus size={17}/>Add task</button></div>
        <section className="player-hud" aria-label="Player progress"><span className="level-badge"><Zap size={21}/><b>LVL {stats.level}</b></span><div className="xp-section"><div className="xp-caption"><span key={stats.xp} className="xp-number">{stats.xp.toLocaleString()} XP</span><span>{stats.levelXP}/100</span></div><div className="xp-track" role="progressbar" aria-label={`Player level ${stats.level} XP`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.levelXP}><span style={{ width: `${stats.levelXP}%` }}/></div></div><Trophy size={23} className="hud-trophy"/></section>
        {cloud.error && <div className="notice" role="alert">{cloud.error}<button disabled={busy} onClick={() => void (cloud.retry ? cloud.retry() : cloud.load())}>Retry</button></div>}
        {cloud.legacy.length>0 && <div className="notice"><span>Browser backup: {cloud.legacy.length} tasks</span><button disabled={busy || !ready} onClick={() => void cloud.importLegacy()}>Import {cloud.legacy.length} tasks</button></div>}
        {busy && <div className="sync-status" role="status">{ready ? "Saving?" : "Connecting?"}</div>}
        {message && <div className="notice" role="status">{message}<button className="icon-button" aria-label="Dismiss message" onClick={() => setMessage("")}><X size={15}/></button></div>}
        <AIChat key={userId} userId={userId} visible={view === "AI chat"}/>
        <section hidden={view === "AI chat"} className={`task-panel ${view === "Calendar" ? "calendar-panel" : ""}`} id="task-list">
          {view === "Calendar" ? <FocusCalendar userId={userId} tasks={tasks} search={search} sessions={savedFocus} timeZone={DEFAULT_TIME_ZONE} onOpenTask={openTask} onDialogChange={() => {}}/> : <>
            <div className="task-toolbar">{view !== "Completed" && view !== "Weekly review" ? <div className="tabs" role="group" aria-label="Filter tasks">{["All tasks", "Overdue", "Today", "Next 7 days", "Later", "Planned today"].map(f => <button key={f} className={`tab ${filter === f ? "selected" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div> : <h2>{view === "Completed" ? "Cleared" : "Review"}</h2>}<span className="count-pill">{visible.length}</span></div>
            {ready && view !== "Completed" && <h2 className="task-group-heading">Upcoming tasks</h2>}
            {!ready ? <div className="empty">Loading…</div> : visible.length ? <div className="quest-list">{visible.map(row)}</div> : <div className="empty"><Gamepad2 size={34}/><h3>{search ? "No matches" : "No quests here"}</h3><button className="text-button" onClick={create}>Add task<ArrowRight size={15}/></button></div>}
            {ready && view !== "Completed" && completedBelow.length > 0 && <section className="completed-task-section" aria-label="Completed tasks"><h2 className="task-group-heading">Completed tasks <span>{completedBelow.length}</span></h2><div className="quest-list">{completedBelow.map(row)}</div></section>}
          </>}
        </section>
      </main>
    </div>
    {alerts && !selected && !editor && <GameDialog title="Reminders" titleId="reminder-title" onClose={() => setAlerts(false)}><div className="reminder-list">{reminders.length ? reminders.map(t => <button className="reminder-item" key={t.id} onClick={() => openTask(t.id)}><span>{t.title}</span><small>{days(t.due) <= 7 ? deadline(t) : "Ready to start"}<ChevronRight size={15}/></small></button>) : <div className="empty">All clear</div>}</div></GameDialog>}
    {selected && !editor && <TaskDetail key={selected.id} userId={userId} task={selected} workspaceLabel={label(selected.workspace)} busy={busy} error={cloud.error} onRetry={cloud.retry ? () => void retrySave() : undefined} onChange={update => updateTask(selected.id, update)} onToggle={() => toggle(selected.id)} onEdit={() => openEditor(selected)} onClose={() => setSelectedId(null)}/>}
    {editor && <TaskEditor key={`${editor.id}:${editorVersion}`} userId={userId} task={editor} busy={busy} error={cloud.error || editorNotice} onRetry={cloud.retry ? () => void retrySave() : undefined} workspaces={workspaces} workspaceLabels={cloud.workspaceLabels} existing={tasks.some(t => t.id === editor.id)} onClose={() => setEditor(null)} onSave={async (task, schedule) => { const saved = schedule ? await cloud.commit({ type: "save-scheduled", task, expectedVersion: editorVersion, ...schedule }) : await persist(task, editorVersion); if (saved) setEditor(null); }} onDelete={async () => { const version=editorVersion; if(version && await cloud.commit({type:"delete",id:editor.id,expectedVersion:version})){setSelectedId(null);setEditor(null);} }}/>}
    {workspaceEdit && <GameDialog title="Rename workspace" titleId="workspace-rename-title" onClose={() => { if (!busy) setWorkspaceEdit(null); }}><form className="workspace-rename-form" onSubmit={async e => { e.preventDefault(); if (busy || !workspaceEdit.name.trim()) return; if (await cloud.commit({ type: "rename-workspace", workspace: workspaceEdit.id as typeof import("@/lib/cloud-model").workspaceNames[number], name: workspaceEdit.name.trim(), expectedVersion: workspaceEdit.version })) setWorkspaceEdit(null); }}><label>Workspace name<input autoFocus required maxLength={50} value={workspaceEdit.name} disabled={busy} onChange={e => setWorkspaceEdit({ ...workspaceEdit, name: e.target.value })}/></label><p>Tasks and schedules stay in this workspace.</p>{cloud.error && <p role="alert">{cloud.error}</p>}<div className="workspace-rename-actions"><button type="button" className="text-button" disabled={busy} onClick={() => setWorkspaceEdit(null)}>Cancel</button><button className="primary" disabled={busy || !workspaceEdit.name.trim()}>{busy ? "Saving…" : "Save"}</button></div></form></GameDialog>}
    {celebration && createPortal(<div className="celebration" key={celebration.id} role="status"><span className="celebration-emblem">{celebration.quest ? <Trophy size={24}/> : <Zap size={24}/>}</span><div><strong>{celebration.message}</strong>{celebration.level && <span>LEVEL {celebration.level}</span>}</div>{celebration.quest && <div className="particles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--x": `${Math.cos(i * 2.4) * 170}px`, "--y": `${Math.sin(i * 2.4) * 120 - 50}px`, "--r": `${i * 37}deg`, "--delay": `${i % 3 * 40}ms` } as CSSProperties}/>)}</div>}</div>, document.querySelector("dialog[open]") || document.body)}
  </div>;
}

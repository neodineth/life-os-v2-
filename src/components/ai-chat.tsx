"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import { nextChatMessages, type ChatMessage } from "@/lib/chat";

export function AIChat({ userId, visible }: { userId: string; visible: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [includeTasks, setIncludeTasks] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingText, setPendingText] = useState("");
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void fetch("/api/chat", { headers: { "X-LifeOS-Account": userId }, cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat could not connect.");
      if (!controller.signal.aborted) { setConfigured(data.configured); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Chat could not connect."); });
    return () => controller.abort();
  }, [userId, visible]);
  useEffect(() => { if (visible) end.current?.scrollIntoView({ block: "nearest" }); }, [messages, pendingText, visible]);
  async function send() {
    const text = draft.trim();
    if (!text || busy || configured !== true) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setPendingText(text);
    const next = nextChatMessages(messages, text);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "X-LifeOS-Account": userId }, cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]), body: JSON.stringify({ messages: next, includeTasks }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The reply could not load. Please retry.");
      if (typeof data.text !== "string" || !data.text.trim()) throw new Error("The reply contained no text. Please retry.");
      if (!controller.signal.aborted) { setMessages([...next, { role: "assistant", text: data.text }]); setDraft(""); if (data.truncated) setError("This reply reached its length limit. Ask Gemini to continue if needed."); }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Connection lost. Your message is still here; try again."); }
    finally { if (!controller.signal.aborted) { setBusy(false); setPendingText(""); } }
  }
  return <section className="ai-chat" hidden={!visible} aria-label="Gemini AI chat">
    <div className="ai-chat-heading"><div><Sparkles size={20}/><h2>Your study and planning assistant</h2></div><button className="secondary" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(""); }}>New chat</button></div>
    <p className="ai-chat-caption">Powered by Google Gemini. Conversations stay in this tab and clear on reload.</p>
    {configured === false && <div className="notice" role="status">Gemini needs an API key. Add GEMINI_API_KEY to .env.local on the server, then restart the app. See docs/GEMINI_SETUP.md.</div>}
    <div className="ai-chat-log" role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
      {!messages.length && !pendingText && <div className="ai-chat-empty"><Sparkles size={30}/><h3>What would you like help with?</h3><p>Practice English, break down an assignment, or plan your next study session.</p><div>{["Help me plan a 30-minute study session.", "Explain when to use present perfect tense."].map(text => <button className="secondary" key={text} disabled={busy} onClick={() => setDraft(text)}>{text}</button>)}</div></div>}
      {messages.map((message, index) => <article className={`ai-chat-message ${message.role}`} key={index}><strong>{message.role === "user" ? "You" : "Gemini"}</strong><p>{message.text}</p></article>)}
      {pendingText && <><article className="ai-chat-message user"><strong>You</strong><p>{pendingText}</p></article><p className="ai-chat-thinking" role="status"><LoaderCircle size={15} className="spin"/> Gemini is thinking…</p></>}
      <div ref={end}/>
    </div>
    <form className="ai-chat-form" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="ai-chat-context"><input type="checkbox" checked={includeTasks} disabled={busy} onChange={event => { setIncludeTasks(event.target.checked); setMessages([]); setError(""); }}/> Share my pending task titles, deadlines, and progress with Gemini</label>
      <p className="ai-chat-caption">Your messages go to Google. Free-tier content may be used to improve its products. Changing task sharing starts a new chat.</p>
      <label htmlFor="ai-chat-message">Message Gemini</label><textarea id="ai-chat-message" value={draft} maxLength={4000} rows={3} placeholder="Ask a question…" disabled={busy} onChange={event => setDraft(event.target.value)}/>
      {error && <p className="ai-chat-error" role="alert">{error}</p>}
      <div className="ai-chat-footer"><span>{draft.length}/4000 · Gemini can make mistakes.</span><button className="primary" type="submit" disabled={busy || !draft.trim() || configured !== true}>{busy ? <LoaderCircle size={16} className="spin"/> : <Send size={16}/>}Send</button></div>
    </form>
  </section>;
}

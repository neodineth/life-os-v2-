"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowRight, Eye, EyeOff, Gamepad2, LoaderCircle, LockKeyhole } from "lucide-react";
export type AuthMode = "login" | "signup" | "recover" | "reset";
const titles = { login: "Welcome back", signup: "Join the game", recover: "Reset your password", reset: "Choose a password" };
export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && new URLSearchParams(window.location.search).get("error") === "link_expired") setError("This link expired or was already used. Request a new reset link, or log in after confirming your email.");
    });
    return () => { cancelled = true; };
  }, []);
  return <div className="auth-shell"><Link href="/login" className="brand"><span className="brand-icon"><Gamepad2 size={26}/></span>LifeOS<span className="brand-dot">.</span></Link><section className="auth-card"><span className="auth-emblem"><LockKeyhole size={24}/></span><h1>{titles[mode]}</h1>
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      const form = new FormData(e.currentTarget);
      const password = String(form.get("password") || ""); const confirmation = String(form.get("confirmation") || "");
      if ((mode === "signup" || mode === "reset") && password !== confirmation) { setError("Passwords do not match."); return; }
      setBusy(true); setError(""); setMessage("");
      const body = mode === "recover" ? { action: mode, email: String(form.get("email")).trim() } : mode === "login" ? { action: mode, email: String(form.get("email")).trim(), password } : mode === "reset" ? { action: mode, password, confirmation } : { action: mode, email: String(form.get("email")).trim(), password, confirmation, playerName: String(form.get("playerName") || "").trim() };
      try {
        const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) { setError(data.error || "Please try again."); return; }
        if (mode === "login" || mode === "reset") { router.replace("/"); router.refresh(); return; }
        setMessage(data.message);
      } catch { setError("Connection lost. Please try again."); } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        {mode === "signup" && <label>Player name <small>(optional)</small><input name="playerName" autoComplete="nickname" maxLength={50} placeholder="Your name"/></label>}
        {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label>}
        {mode !== "recover" && <PasswordField name="password" label="Password" minLength={mode === "login" ? 1 : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Your password" : "At least 8 characters"}/>}
        {(mode === "signup" || mode === "reset") && <PasswordField name="confirmation" label="Confirm password" minLength={8} autoComplete="new-password" placeholder="Repeat password"/>}
        {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-success" role="status">{message}</p>}
        <button className="primary" type="submit">{busy ? <LoaderCircle className="spin" size={17}/> : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : mode === "recover" ? "Send reset link" : "Save password"}{!busy && <ArrowRight size={16}/>}</button>
      </fieldset>
    </form>
    <div className="auth-links">{mode === "login" ? <><Link href="/forgot-password">Forgot password?</Link><span>New player? <Link href="/signup">Create account</Link></span></> : <Link href="/login">Back to login</Link>}</div>
  </section></div>;
}

function PasswordField({ name, label, minLength, autoComplete, placeholder }: {
  name: string; label: string; minLength: number; autoComplete: string; placeholder: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-control">
      <input id={id} name={name} type={visible ? "text" : "password"} required minLength={minLength} maxLength={128} autoComplete={autoComplete} placeholder={placeholder}/>
      <button className="auth-password-toggle" type="button" aria-controls={id} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={16} aria-hidden="true"/> : <Eye size={16} aria-hidden="true"/>}<span>{visible ? "Hide" : "Show"}</span>
      </button>
    </div>
  </div>;
}

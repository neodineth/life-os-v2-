"use client";

import { useEffect, useRef, useState } from "react";

type Issue = { message: string; corrections: string[] };

export function GrammarCheck({ text, onChange, maxLength, disabled = false }: {
  text: string; onChange: (text: string) => void; maxLength: number; disabled?: boolean;
}) {
  const [result, setResult] = useState<{ text: string; issues: Issue[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [previousText, setPreviousText] = useState(text);
  const generation = useRef(0);
  if (previousText !== text) {
    setPreviousText(text); setChecking(false); setError(""); setResult(null);
  }
  useEffect(() => { generation.current++; }, [text]);
  useEffect(() => () => { generation.current++; }, []);

  async function check() {
    const current = ++generation.current;
    setChecking(true); setError(""); setResult(null);
    try {
      const { checkEnglish } = await import("@/lib/grammar");
      const issues = await checkEnglish(text);
      if (generation.current === current) setResult({ text, issues });
    } catch {
      if (generation.current === current) setError("English check unavailable. You can keep editing or try again.");
    } finally {
      if (generation.current === current) setChecking(false);
    }
  }

  const visible = result?.text === text ? result : null;
  return <div className="grammar-check">
    <button className="grammar-trigger" type="button" disabled={disabled || checking || !text.trim()} onClick={check}>{checking ? "Checking English…" : "Check English"}</button>
    <span className="grammar-hint">Checked on your device</span>
    <div aria-live="polite" aria-atomic="true">
      {error && <p className="grammar-message">{error}</p>}
      {visible && (visible.issues.length ? <ul className="grammar-results">{visible.issues.map((issue, index) => <li key={index}>
        <p>{issue.message}</p>
        {issue.corrections.map((correction, suggestion) => <button className="grammar-apply" type="button" key={suggestion} disabled={disabled || correction.length > maxLength} onClick={() => { setResult(null); onChange(correction); }}>Apply: {correction}</button>)}
      </li>)}</ul> : <p className="grammar-message">No English issues found.</p>)}
    </div>
  </div>;
}

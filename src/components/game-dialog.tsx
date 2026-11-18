"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function GameDialog({ title, titleId, onClose, children, wide = false, actions }: {
  title: string; titleId: string; onClose: () => void; children: ReactNode; wide?: boolean; actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const active = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
      if (active?.isConnected) active.focus();
      else document.getElementById("add-task")?.focus();
    };
  }, []);
  return <dialog ref={ref} className={`game-dialog ${wide ? "wide" : ""}`} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => {
    if (e.key !== "Tab") return;
    const elements = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0);
    const first = elements[0], last = elements.at(-1);
    if (!first || !last) { e.preventDefault(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }} onClick={e => {
    if (e.target === e.currentTarget) {
      const box = e.currentTarget.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose();
    }
  }}>
    <div className="dialog-head"><h2 id={titleId}>{title}</h2><div className="dialog-actions">{actions}<button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19}/></button></div></div>
    {children}
  </dialog>;
}

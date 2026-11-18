import type { Metadata } from "next";
import "./globals.css";
import "./calendar.css";
import "./chat.css";
import "./task-schedules.css";

export const metadata: Metadata = {
  title: "LifeOS — Neon quest workspace",
  description: "Turn tasks into quests. Complete levels, track progress, and earn XP across your universities, startups, and personal growth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

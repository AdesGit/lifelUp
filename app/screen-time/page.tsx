"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

type DayRecord = Doc<"daily_activity">;

const CHILDREN = [
  { id: 3, name: "Keoni", color: "bg-green-500",  light: "bg-green-50  dark:bg-green-950",  text: "text-green-700 dark:text-green-300",  border: "border-green-200 dark:border-green-800",  bar: "bg-green-400" },
  { id: 4, name: "Kalea", color: "bg-purple-500", light: "bg-purple-50 dark:bg-purple-950", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800", bar: "bg-purple-400" },
] as const;

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

// ── Mini bar for the 7-day strip ─────────────────────────────────────────────
function DayStrip({
  records,
  selected,
  onSelect,
  bar,
}: {
  records: DayRecord[];
  selected: string;
  onSelect: (date: string) => void;
  bar: string;
}) {
  const byDate = Object.fromEntries(records.map((r) => [r.activity_date, r]));
  // Build last 7 days in order
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  const max = Math.max(...days.map((d) => byDate[d]?.total_time_minutes ?? 0), 1);

  return (
    <div className="flex gap-1.5 items-end h-16">
      {days.map((d) => {
        const rec = byDate[d];
        const pct = rec ? Math.max(6, Math.round((rec.total_time_minutes / max) * 100)) : 0;
        const isSelected = d === selected;
        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            className="flex flex-col items-center gap-1 flex-1 group"
            title={rec ? `${dateLabel(d)} — ${formatMinutes(rec.total_time_minutes)}` : dateLabel(d)}
          >
            <div className="w-full flex items-end justify-center h-10">
              {rec ? (
                <div
                  className={`w-full rounded-t transition-all ${bar} ${isSelected ? "opacity-100 ring-2 ring-offset-1 ring-current" : "opacity-50 group-hover:opacity-75"}`}
                  style={{ height: `${pct}%` }}
                />
              ) : (
                <div className="w-full h-1 rounded bg-gray-200 dark:bg-gray-700" />
              )}
            </div>
            <span className={`text-[10px] transition-colors ${isSelected ? "text-gray-900 dark:text-white font-semibold" : "text-gray-400"}`}>
              {new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "narrow" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── App row ────────────────────────────────────────────────────────────────────
function AppRow({ app, total, bar }: { app: DayRecord["apps"][number]; total: number; bar: string }) {
  const pct = total > 0 ? Math.round((app.minutes / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{app.name}</span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0 tabular-nums">
          {app.time_formatted}
        </span>
        <span className="text-xs text-gray-400 flex-shrink-0 w-8 text-right tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`h-1.5 rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Day detail card ────────────────────────────────────────────────────────────
function DayCard({
  record,
  child,
}: {
  record: DayRecord | undefined;
  child: (typeof CHILDREN)[number];
}) {
  if (!record) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <span className="text-3xl">📵</span>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Aucune donnée pour ce jour</p>
      </div>
    );
  }

  const sortedApps = [...record.apps].sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className={`rounded-2xl border ${child.border} ${child.light} px-4 py-3 flex items-center justify-between`}>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Temps d&apos;écran total</p>
          <p className={`text-2xl font-bold ${child.text}`}>{formatMinutes(record.total_time_minutes)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 dark:text-gray-400">Applications</p>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{record.apps.length}</p>
        </div>
      </div>

      {/* Per-app breakdown */}
      {sortedApps.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Par application (≥30 min)
          </p>
          {sortedApps.map((app) => (
            <AppRow key={app.pkg} app={app} total={record.total_time_minutes} bar={child.bar} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">Aucune application ≥30 min</p>
      )}

      <p className="text-xs text-gray-300 dark:text-gray-600 text-center">
        Extrait le {new Date(record.extraction_date).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ScreenTimePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [activeChild, setActiveChild] = useState<number>(4); // Kalea default
  const [selectedDate, setSelectedDate] = useState<string>(yesterday());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  const keoniRecent = useQuery(api.familylinkActivity.getRecentActivity, { child_id: 3, days: 7 });
  const kaleaRecent = useQuery(api.familylinkActivity.getRecentActivity, { child_id: 4, days: 7 });

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const child = CHILDREN.find((c) => c.id === activeChild)!;
  const records = activeChild === 3 ? (keoniRecent ?? []) : (kaleaRecent ?? []);
  const dayRecord = records.find((r) => r.activity_date === selectedDate);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">My todos</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Family</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Coach</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Goals</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Context</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Recurring</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Fichiers</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Quests</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/calendar" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Calendrier</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos-board" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Todos Board</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Dashboard</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Screen Time</span>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/agents" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Agents</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/integrations" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Intégrations</Link>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col max-w-xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-8 gap-6">
        {/* Title */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Temps d&apos;écran</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Usage quotidien par enfant · 7 derniers jours</p>
        </div>

        {/* Child tabs */}
        <div className="flex gap-2">
          {CHILDREN.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveChild(c.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeChild === c.id
                  ? `${c.color} text-white shadow-sm`
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* 7-day strip */}
        {records.length > 0 || keoniRecent !== undefined ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">7 derniers jours</p>
            <DayStrip
              records={records}
              selected={selectedDate}
              onSelect={setSelectedDate}
              bar={child.bar}
            />
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {/* Date label + nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() - 1);
              setSelectedDate(d.toISOString().split("T")[0]);
            }}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded transition-colors"
          >
            ←
          </button>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
            {dateLabel(selectedDate)}
          </p>
          <button
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() + 1);
              const next = d.toISOString().split("T")[0];
              if (next <= new Date().toISOString().split("T")[0]) setSelectedDate(next);
            }}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded transition-colors disabled:opacity-30"
          >
            →
          </button>
        </div>

        {/* Day detail */}
        <DayCard record={dayRecord} child={child} />
      </div>
    </main>
  );
}

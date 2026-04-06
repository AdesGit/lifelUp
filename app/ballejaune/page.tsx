"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

type Activity = Doc<"ballejaune_activity">;
type Session = Activity["sessions"][number];

const STATUS_CONFIG: Record<Session["status"], { label: string; color: string; dot: string; done: boolean }> = {
  played:    { label: "Joué",    color: "text-green-700 dark:text-green-300",  dot: "bg-green-500",  done: true  },
  confirmed: { label: "Confirmé",color: "text-blue-700  dark:text-blue-300",   dot: "bg-blue-500",   done: false },
  upcoming:  { label: "À venir", color: "text-orange-700 dark:text-orange-300",dot: "bg-orange-400", done: false },
  cancelled: { label: "Annulé",  color: "text-gray-400  dark:text-gray-600",   dot: "bg-gray-300",   done: false },
  unknown:   { label: "?",       color: "text-gray-500  dark:text-gray-500",   dot: "bg-gray-300",   done: false },
};

const MEMBERS = ["GALL Christian", "GALL Linda"] as const;
const MEMBER_COLORS = {
  "GALL Christian": { tab: "bg-blue-500",   bar: "bg-blue-400",   ring: "ring-blue-400"   },
  "GALL Linda":     { tab: "bg-pink-500",   bar: "bg-pink-400",   ring: "ring-pink-400"   },
};

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

// ── 14-day activity strip ────────────────────────────────────────────────────
function ActivityStrip({
  records,
  selected,
  onSelect,
  bar,
}: {
  records: Activity[];
  selected: string;
  onSelect: (date: string) => void;
  bar: string;
}) {
  const byDate = Object.fromEntries(records.map((r) => [r.activityDate, r]));
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  const max = Math.max(...days.map((d) => byDate[d]?.totalSessions ?? 0), 1);

  return (
    <div className="flex gap-1 items-end h-14">
      {days.map((d) => {
        const rec = byDate[d];
        const hasSessions = (rec?.totalSessions ?? 0) > 0;
        const isSelected = d === selected;
        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            title={rec ? `${dateLabel(d)} — ${rec.totalSessions} session(s)` : dateLabel(d)}
            className="flex flex-col items-center gap-1 flex-1 group"
          >
            <div className="w-full flex items-end justify-center h-8">
              {hasSessions ? (
                <div
                  className={`w-full rounded-t transition-all ${bar} ${isSelected ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`}
                  style={{ height: `${Math.max(30, Math.round((rec!.totalSessions / max) * 100))}%` }}
                />
              ) : (
                <div className={`w-full h-1 rounded ${isSelected ? "bg-gray-400" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
            </div>
            <span className={`text-[9px] leading-none ${isSelected ? "text-gray-900 dark:text-white font-semibold" : "text-gray-400"}`}>
              {new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Session card (todo-style) ─────────────────────────────────────────────────
function SessionCard({ session }: { session: Session }) {
  const cfg = STATUS_CONFIG[session.status];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-opacity ${
      session.status === "cancelled"
        ? "opacity-40 border-gray-100 dark:border-gray-800"
        : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
    }`}>
      {/* Checkbox-style indicator */}
      <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
        cfg.done
          ? "bg-green-500 border-green-500"
          : "border-gray-300 dark:border-gray-600"
      }`}>
        {cfg.done && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${session.status === "cancelled" ? "line-through text-gray-400" : "text-gray-900 dark:text-white"}`}>
            🎾 Padel {session.time_start} — {session.court}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span>{formatMinutes(session.duration_minutes)}</span>
          {session.partners.length > 0 && (
            <span>avec {session.partners.join(", ")}</span>
          )}
        </div>
      </div>

      <span className="flex-shrink-0 text-xs text-gray-300 dark:text-gray-600 tabular-nums">
        {session.booking_id}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BalleJaunePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [activeMember, setActiveMember] = useState<string>("GALL Christian");
  const [selectedDate, setSelectedDate] = useState<string>(yesterday());
  const [activeClub, setActiveClub] = useState<"all" | "excelsior" | "padelasdragon">("all");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  const christianRecords = useQuery(api.ballejaune.getRecentActivity, {
    memberLogin: "GALL Christian", days: 14,
  });
  const lindaRecords = useQuery(api.ballejaune.getRecentActivity, {
    memberLogin: "GALL Linda", days: 14,
  });
  const me = useQuery(api.users.getMe);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const records = activeMember === "GALL Christian" ? (christianRecords ?? []) : (lindaRecords ?? []);
  const colors = MEMBER_COLORS[activeMember as keyof typeof MEMBER_COLORS];

  // Filter by club + selected date
  const dayRecords = records.filter((r) =>
    r.activityDate === selectedDate &&
    (activeClub === "all" || r.club === activeClub)
  );

  // All sessions for selected day (merge across clubs if "all")
  const allSessions = dayRecords.flatMap((r) => r.sessions);
  const activeSessions = allSessions.filter((s) => s.status !== "cancelled");
  const totalMinutes = dayRecords.reduce((sum, r) => sum + r.totalMinutes, 0);

  // Stats for last 14 days
  const totalPlayedSessions = records.reduce((sum, r) => sum + r.totalSessions, 0);
  const totalPlayedMinutes  = records.reduce((sum, r) => sum + r.totalMinutes,  0);

  const clubs = [...new Set(records.map((r) => r.club))];

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
          <Link href="/screen-time" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Screen Time</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-yellow-600 dark:text-yellow-400 font-medium whitespace-nowrap">Padel</span>
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sessions Padel</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Données BalleJaune · 14 derniers jours</p>
        </div>

        {/* Member linking banner — show if current user has no ballejauneLogin */}
        {me && !me.ballejauneLogin && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 flex items-start gap-3">
            <span className="text-yellow-500 text-lg flex-shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Compte non lié</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                Votre compte n&apos;est pas encore lié à BalleJaune. Les sessions joués ne s&apos;ajouteront pas à vos todos automatiquement.
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                Demandez à Christian de lier votre compte via le tableau de bord admin.
              </p>
            </div>
          </div>
        )}

        {/* Member tabs */}
        <div className="flex gap-2">
          {MEMBERS.map((m) => {
            const col = MEMBER_COLORS[m];
            return (
              <button
                key={m}
                onClick={() => setActiveMember(m)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeMember === m
                    ? `${col.tab} text-white shadow-sm`
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {m === "GALL Christian" ? "Christian" : "Linda"}
              </button>
            );
          })}
        </div>

        {/* 14-day strip */}
        {records.length > 0 || christianRecords !== undefined ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">14 derniers jours</p>
            <ActivityStrip
              records={records}
              selected={selectedDate}
              onSelect={setSelectedDate}
              bar={colors.bar}
            />
            {/* 14-day totals */}
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span><span className="font-medium text-gray-700 dark:text-gray-300">{totalPlayedSessions}</span> sessions</span>
              <span><span className="font-medium text-gray-700 dark:text-gray-300">{formatMinutes(totalPlayedMinutes)}</span> sur le court</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {/* Date nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() - 1);
              setSelectedDate(d.toISOString().split("T")[0]);
            }}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded transition-colors"
          >←</button>
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
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded transition-colors"
          >→</button>
        </div>

        {/* Club filter (only show if multiple clubs) */}
        {clubs.length > 1 && (
          <div className="flex gap-2">
            {(["all", ...clubs] as const).map((c) => (
              <button
                key={c}
                onClick={() => setActiveClub(c as typeof activeClub)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                  activeClub === c
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                }`}
              >
                {c === "all" ? "Tous les clubs" : c === "excelsior" ? "Excelsior" : "Padel as Dragon"}
              </button>
            ))}
          </div>
        )}

        {/* Day summary */}
        {dayRecords.length > 0 && (
          <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between ${
            activeMember === "GALL Christian"
              ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
              : "bg-pink-50 dark:bg-pink-950 border-pink-200 dark:border-pink-800"
          }`}>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Sessions du jour</p>
              <p className={`text-2xl font-bold ${
                activeMember === "GALL Christian" ? "text-blue-700 dark:text-blue-300" : "text-pink-700 dark:text-pink-300"
              }`}>{activeSessions.length}</p>
            </div>
            {totalMinutes > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Temps de jeu</p>
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{formatMinutes(totalMinutes)}</p>
              </div>
            )}
          </div>
        )}

        {/* Sessions list */}
        {allSessions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Sessions · {dayRecords[0]?.club === "excelsior" ? "Excelsior" : "Padel as Dragon"}
            </p>
            {allSessions.map((session) => (
              <SessionCard key={session.booking_id} session={session} />
            ))}
          </div>
        ) : dayRecords.length > 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucune session ce jour</p>
        ) : records.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <span className="text-3xl">🎾</span>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Pas de données pour ce jour</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <span className="text-3xl">🎾</span>
            <p className="text-gray-900 dark:text-white font-medium">Aucune donnée reçue</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              Les données arrivent via le cron BalleJaune chaque nuit.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

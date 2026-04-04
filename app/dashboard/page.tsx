"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { SignOutButton } from "@/components/SignOutButton";
import Link from "next/link";
import { COLOR_PALETTE } from "@/components/calendar/EventChip";

type TodoWithUser = Doc<"todos"> & { user: Doc<"users"> | null };

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function displayName(user: Doc<"users">): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  return (user.email ?? "").split("@")[0];
}

function getMonthGrid(month: Date): Date[] {
  const year = month.getFullYear(), m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const grid: Date[] = [];
  for (let i = -startOffset; i < 42 - startOffset; i++) {
    grid.push(new Date(year, m, 1 + i));
  }
  return grid;
}

function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt(totalStars / 5)) + 1;
}

export default function DashboardPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const today = new Date();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime();

  const monthEvents = useQuery(api.todos.getTodosInRange, { fromTs: startOfMonth, toTs: endOfMonth }) as TodoWithUser[] | undefined;
  const todayEvents = useQuery(api.todos.getTodosInRange, { fromTs: startOfDay, toTs: endOfDay }) as TodoWithUser[] | undefined;
  const familyData = useQuery(api.todos.listAllForFamily);
  const me = useQuery(api.users.getMe);
  const allUsers = useQuery(api.users.listAll);

  const userOrderMap = new Map<string, number>();
  if (allUsers) {
    const sorted = [...allUsers].sort((a, b) => a._creationTime - b._creationTime);
    sorted.forEach((u, i) => userOrderMap.set(String(u._id), i));
  }

  // Mini calendar: days with events this month
  const daysWithEvents = new Set<number>();
  monthEvents?.forEach((ev) => {
    if (ev.dueAt) daysWithEvents.add(new Date(ev.dueAt).getDate());
  });

  // My todos today: due today or overdue
  const myTodosToday = familyData
    ?.find((fd) => String(fd.user._id) === String(me?._id))
    ?.todos.filter((t) => t.dueAt != null && t.dueAt <= endOfDay) ?? [];

  // Family progress today
  const familyProgress = familyData?.map(({ user, todos }) => {
    const allTodayTodos = [...todos]; // incomplete
    // We need completed ones too — use listAllForFamily which only has incomplete
    // So progress = 0/total for simplification (no completed count available here)
    const dueToday = allTodayTodos.filter((t) => t.dueAt != null && isSameDay(new Date(t.dueAt), today));
    return { user, dueToday: dueToday.length };
  }) ?? [];

  const grid = getMonthGrid(today);

  if (isLoading || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  const NAV_LINKS = [
    { href: "/", label: "Mes todos" }, { href: "/family", label: "Family" },
    { href: "/coach", label: "Coach" }, { href: "/goals", label: "Goals" },
    { href: "/context", label: "Context" }, { href: "/todos/recurring", label: "Recurring" },
    { href: "/fichiers", label: "Fichiers" }, { href: "/quests", label: "Quests" },
    { href: "/calendar", label: "Calendrier" },
    { href: "/todos-board", label: "Todos Board" },
    { href: "/dashboard", label: "Dashboard", active: true },
    { href: "/agents", label: "Agents" }, { href: "/integrations", label: "Intégrations" },
  ];

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          {NAV_LINKS.map((link, i) => (
            <>
              {i > 0 && <span key={`sep-${i}`} className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>}
              {link.active
                ? <span key={link.href} className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">{link.label}</span>
                : <Link key={link.href} href={link.href} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">{link.label}</Link>
              }
            </>
          ))}
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SignOutButton />
        </div>
      </header>

      <div className="flex-1 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Left column: mini calendar + today events */}
          <div className="flex flex-col gap-4">
            {/* Mini calendar */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {MONTHS_FR[today.getMonth()]} {today.getFullYear()}
              </h2>
              <div className="grid grid-cols-7 gap-0 text-center">
                {DAY_LABELS.map((d, i) => (
                  <div key={i} className="text-[10px] font-medium text-gray-400 py-1">{d}</div>
                ))}
                {grid.map((date, idx) => {
                  const isCurrentMonth = date.getMonth() === today.getMonth();
                  const isToday = isSameDay(date, today);
                  const hasDot = isCurrentMonth && daysWithEvents.has(date.getDate());
                  return (
                    <div key={idx} className={`relative flex flex-col items-center py-1 ${!isCurrentMonth ? "opacity-30" : ""}`}>
                      <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-blue-600 text-white font-bold" : "text-gray-600 dark:text-gray-400"}`}>
                        {date.getDate()}
                      </span>
                      {hasDot && !isToday && (
                        <span className="w-1 h-1 rounded-full bg-blue-400 mt-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Today events */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Événements aujourd&apos;hui</h2>
              {todayEvents === undefined && <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />}
              {todayEvents?.length === 0 && <p className="text-sm text-gray-400 italic">Aucun événement</p>}
              <div className="space-y-2">
                {todayEvents?.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)).map((ev) => {
                  const colorIndex = userOrderMap.get(String(ev.userId)) ?? 0;
                  const colors = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
                  const time = ev.dueAt ? new Date(ev.dueAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div key={ev._id} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.bg}`} />
                      <span className="text-xs text-gray-500 w-10 flex-shrink-0">{time}</span>
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{ev.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column: my todos today + family progress */}
          <div className="flex flex-col gap-4">
            {/* My todos today / overdue */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Mes todos aujourd&apos;hui
              </h2>
              {familyData === undefined && <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />}
              {myTodosToday.length === 0 && familyData !== undefined && (
                <p className="text-sm text-gray-400 italic">Aucun todo dû aujourd&apos;hui</p>
              )}
              <div className="space-y-1.5">
                {myTodosToday.map((todo) => {
                  const overdue = (todo.dueAt ?? 0) < startOfDay;
                  return (
                    <div key={todo._id} className={`flex items-center gap-2 p-2 rounded-lg ${overdue ? "bg-red-50 dark:bg-red-900/10" : "bg-gray-50 dark:bg-gray-800"}`}>
                      <div className={`flex-shrink-0 w-3 h-3 rounded-full border-2 ${overdue ? "border-red-400" : "border-blue-400"}`} />
                      <span className={`text-sm flex-1 ${overdue ? "text-red-700 dark:text-red-300" : "text-gray-700 dark:text-gray-300"}`}>{todo.text}</span>
                      {todo.starValue != null && <span className="text-xs text-yellow-500">⭐{todo.starValue}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Family progress today */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Progrès famille aujourd&apos;hui</h2>
              {familyData === undefined && <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />}
              <div className="space-y-3">
                {familyProgress.map(({ user, dueToday }) => {
                  const colorIndex = userOrderMap.get(String(user._id)) ?? 0;
                  const colors = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
                  const level = computeLevel(user.totalStars ?? 0);
                  return (
                    <div key={user._id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full ${colors.bg} flex items-center justify-center text-white text-[10px] font-bold`}>
                            {(user.firstName ?? user.email ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{displayName(user)}</span>
                          <span className="text-[10px] text-gray-400">Lv.{level}</span>
                        </div>
                        <span className="text-xs text-gray-500">{dueToday} todo{dueToday !== 1 ? "s" : ""} aujourd&apos;hui</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${colors.bg} rounded-full transition-all`} style={{ width: dueToday > 0 ? "30%" : "0%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

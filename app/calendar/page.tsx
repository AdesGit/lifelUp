"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { SignOutButton } from "@/components/SignOutButton";
import Link from "next/link";
import MonthView from "@/components/calendar/MonthView";
import WeekView from "@/components/calendar/WeekView";
import DayView from "@/components/calendar/DayView";
import EventModal from "@/components/calendar/EventModal";

type TodoWithUser = Doc<"todos"> & { user: Doc<"users"> | null };
type View = "month" | "week" | "day";

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function CalendarPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedTodo, setSelectedTodo] = useState<TodoWithUser | null>(null);
  const [selectedSlotDate, setSelectedSlotDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  // Compute range for current view
  const { fromTs, toTs } = (() => {
    if (view === "month") {
      const y = currentDate.getFullYear(), m = currentDate.getMonth();
      return { fromTs: new Date(y, m, 1).getTime(), toTs: new Date(y, m + 1, 0, 23, 59, 59, 999).getTime() };
    } else if (view === "week") {
      const ws = getWeekStart(currentDate);
      return { fromTs: ws.getTime(), toTs: ws.getTime() + 7 * 24 * 60 * 60 * 1000 - 1 };
    } else {
      const d = new Date(currentDate); d.setHours(0, 0, 0, 0);
      return { fromTs: d.getTime(), toTs: d.getTime() + 24 * 60 * 60 * 1000 - 1 };
    }
  })();

  const events = useQuery(api.todos.getTodosInRange, { fromTs, toTs }) as TodoWithUser[] | undefined;
  const allUsers = useQuery(api.users.listAll);
  const gcalToken = useQuery(api.googleCalendar.getMyToken);
  const updateDueAt = useMutation(api.todos.updateDueAt);

  // Build userIndex map keyed by userId string
  const userIndexMap = new Map<string, number>();
  if (allUsers) {
    const sorted = [...allUsers].sort((a, b) => a._creationTime - b._creationTime);
    sorted.forEach((u, i) => userIndexMap.set(String(u._id), i));
  }

  async function handleDrop(todoId: string, newDueAt: number) {
    // Optimistically update in Convex
    try {
      await updateDueAt({ id: todoId as Doc<"todos">["_id"], dueAt: newDueAt });
    } catch (err) {
      console.error("updateDueAt failed", err);
      return;
    }

    // Find the todo to get gcalEventId
    const todo = events?.find((e) => e._id === todoId);
    if (!todo?.gcalEventId || !gcalToken) return;

    // PATCH GCal asynchronously
    fetch("/api/gcal/event-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        todoId,
        newDueAt,
        userId: gcalToken.userId,
        gcalEventId: todo.gcalEventId,
        calendarId: gcalToken.calendarId,
        accessToken: gcalToken.accessToken,
        expiresAt: gcalToken.expiresAt,
        refreshToken: gcalToken.refreshToken,
      }),
    }).catch(console.error);
  }

  function handleClickEvent(todo: TodoWithUser) {
    setSelectedTodo(todo);
    setModalMode("edit");
  }

  function handleClickSlot(date: Date) {
    setSelectedSlotDate(date);
    setModalMode("create");
  }

  function navigate(dir: 1 | -1) {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  }

  function getTitle() {
    if (view === "month") return `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (view === "week") {
      const ws = getWeekStart(currentDate);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      return `${ws.getDate()} – ${we.getDate()} ${MONTHS_FR[we.getMonth()]} ${we.getFullYear()}`;
    }
    return `${currentDate.getDate()} ${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }

  if (isLoading || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  const NAV_LINKS = [
    { href: "/", label: "Mes todos" }, { href: "/family", label: "Family" },
    { href: "/coach", label: "Coach" }, { href: "/goals", label: "Goals" },
    { href: "/context", label: "Context" }, { href: "/todos/recurring", label: "Recurring" },
    { href: "/fichiers", label: "Fichiers" }, { href: "/quests", label: "Quests" },
    { href: "/calendar", label: "Calendrier", active: true },
    { href: "/todos-board", label: "Todos Board" }, { href: "/dashboard", label: "Dashboard" },
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

      <div className="flex flex-col flex-1 p-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400">‹</button>
            <button onClick={() => setCurrentDate(new Date())} className="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">Aujourd&apos;hui</button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400">›</button>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{getTitle()}</span>
          </div>
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 transition-colors ${view === v ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
              >
                {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar view */}
        <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900" style={{ minHeight: "500px" }}>
          {events === undefined ? (
            <div className="flex items-center justify-center h-full">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : view === "month" ? (
            <MonthView events={events} currentMonth={currentDate} userIndexMap={userIndexMap} onDrop={handleDrop} onClickEvent={handleClickEvent} onClickSlot={handleClickSlot} />
          ) : view === "week" ? (
            <WeekView events={events} currentWeek={getWeekStart(currentDate)} userIndexMap={userIndexMap} onDrop={handleDrop} onClickEvent={handleClickEvent} onClickSlot={handleClickSlot} />
          ) : (
            <DayView events={events} currentDay={currentDate} userIndexMap={userIndexMap} onDrop={handleDrop} onClickEvent={handleClickEvent} onClickSlot={handleClickSlot} />
          )}
        </div>
      </div>

      {/* Modals */}
      {modalMode === "create" && (
        <EventModal mode="create" defaultDate={selectedSlotDate ?? undefined} onClose={() => setModalMode(null)} onSaved={() => {}} />
      )}
      {modalMode === "edit" && selectedTodo && (
        <EventModal mode="edit" todo={selectedTodo} onClose={() => { setModalMode(null); setSelectedTodo(null); }} onSaved={() => {}} />
      )}
    </main>
  );
}

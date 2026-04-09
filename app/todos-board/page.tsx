"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { SignOutButton } from "@/components/SignOutButton";
import Link from "next/link";
import TodoColumn from "@/components/todos-board/TodoColumn";

type Tab = "mes" | "famille";

function formatDueAt(dueAt: number): string {
  const d = new Date(dueAt);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

function groupByDate(todos: Doc<"todos">[]): { label: string; date: string; todos: Doc<"todos">[] }[] {
  const groups: Record<string, Doc<"todos">[]> = {};
  for (const t of todos) {
    if (!t.dueAt) continue;
    const d = new Date(t.dueAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, todos]) => ({ label: formatDueAt(todos[0].dueAt!), date, todos }));
}

export default function TodosBoardPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mes");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  const board = useQuery(api.todos.listForBoard);
  const familyData = useQuery(api.todos.listAllForFamily);
  const toggleForUser = useMutation(api.todos.toggleForUser);
  const allUsers = useQuery(api.users.listAll);

  const userOrderMap = new Map<string, number>();
  if (allUsers) {
    const sorted = [...allUsers].sort((a, b) => a._creationTime - b._creationTime);
    sorted.forEach((u, i) => userOrderMap.set(String(u._id), i));
  }

  if (isLoading || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  const NAV_LINKS = [
    { href: "/", label: "Mes todos" }, { href: "/family", label: "Family" },
    { href: "/coach", label: "Coach" }, { href: "/goals", label: "Goals" },
    { href: "/context", label: "Context" }, { href: "/todos/recurring", label: "Recurring" },
    { href: "/fichiers", label: "Fichiers" }, { href: "/quests", label: "Quests" },
    { href: "/calendar", label: "Calendrier" },
    { href: "/todos-board", label: "Todos Board", active: true },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/agents", label: "Agents" }, { href: "/integrations", label: "Intégrations" },
    { href: "/profile", label: "Profile" },
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
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            onClick={() => setTab("mes")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "mes" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Mes todos
          </button>
          <button
            onClick={() => setTab("famille")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "famille" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Famille
          </button>
        </div>

        {/* "Mes todos" tab */}
        {tab === "mes" && (
          <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
            {board === undefined && (
              <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
            )}
            {board && (
              <>
                {/* Non planifié */}
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Non planifié ({board.unplanned.length})
                  </h2>
                  {board.unplanned.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Aucun todo non planifié</p>
                  ) : (
                    <div className="space-y-1.5">
                      {board.unplanned.map((todo) => (
                        <div key={todo._id} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                          <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 border-gray-300" />
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{todo.text}</span>
                          {todo.starValue != null && <span className="text-xs text-yellow-500">⭐{todo.starValue}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Planifié */}
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                    Planifié ({board.planned.length})
                  </h2>
                  {board.planned.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Aucun todo planifié</p>
                  ) : (
                    <div className="space-y-3">
                      {groupByDate(board.planned).map(({ label, date, todos }) => (
                        <div key={date}>
                          <p className="text-xs font-medium text-gray-400 mb-1.5 capitalize">{label}</p>
                          <div className="space-y-1">
                            {todos.map((todo) => (
                              <div key={todo._id} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                                <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 border-blue-400" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{todo.text}</span>
                                {todo.starValue != null && <span className="text-xs text-yellow-500">⭐{todo.starValue}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* "Famille" tab */}
        {tab === "famille" && (
          <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
            {familyData === undefined && (
              <div className="flex justify-center items-center flex-1"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
            )}
            {familyData?.map(({ user, todos }) => {
              const colorIndex = userOrderMap.get(String(user._id)) ?? 0;
              return (
                <TodoColumn
                  key={user._id}
                  user={user}
                  todos={todos}
                  colorIndex={colorIndex}
                  canComplete
                  onComplete={(id) => toggleForUser({ id: id as Doc<"todos">["_id"] })}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";
import Link from "next/link";

function initials(email: string) {
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt(totalStars / 5)) + 1;
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!user) return "Unknown";
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  return (user.email ?? "").split("@")[0];
}

const COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
];

export default function FamilyPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const todos = useQuery(api.todos.listAll);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // Group todos by user
  type TodoItem = NonNullable<typeof todos>[number];
  type UserGroup = { email: string; todos: TodoItem[] };
  const byUser = todos?.reduce<Record<string, UserGroup>>((acc: Record<string, UserGroup>, todo: TodoItem) => {
    const email = todo.user?.email ?? "Unknown";
    if (!acc[email]) acc[email] = { email, todos: [] };
    acc[email].todos.push(todo);
    return acc;
  }, {}) ?? {};

  const users = Object.values(byUser) as UserGroup[];
  // Default to first user if none selected
  const effectiveEmail = selectedEmail ?? users[0]?.email ?? null;
  const selectedUser = effectiveEmail ? (byUser[effectiveEmail] ?? null) : null;
  const selectedIndex = users.findIndex((u) => u.email === effectiveEmail);
  const selectedColor = selectedIndex >= 0 ? COLORS[selectedIndex % COLORS.length] : COLORS[0];

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            My todos
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Family</span>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Coach
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Goals
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Context
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Recurring
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Fichiers
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Quests
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/calendar" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Calendrier
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos-board" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Todos Board
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Dashboard
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/agents" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Agents
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/integrations" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Intégrations
          </Link>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8 pt-6 sm:pt-10 max-w-2xl mx-auto w-full">
        <div className="w-full">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Family todos</h2>

          {todos === undefined && (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          )}

          {todos?.length === 0 && (
            <p className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
              No todos yet in the family.
            </p>
          )}

          {users.length > 0 && (
            <>
              {/* Tab bar */}
              <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
                {users.map(({ email, todos: userTodos }, i) => {
                  const done = userTodos.filter((t) => t.completed).length;
                  const color = COLORS[i % COLORS.length];
                  const userObj = userTodos[0]?.user;
                  const userStars = userObj?.totalStars ?? 0;
                  const userLevel = computeLevel(userStars);
                  return (
                    <button
                      key={email}
                      onClick={() => setSelectedEmail(email)}
                      className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        email === effectiveEmail
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {initials(email)}
                      </div>
                      <span className="max-w-[80px] sm:max-w-none truncate">{displayName(userObj ?? { email })}</span>
                      <span className="text-xs text-gray-400">Lv.{userLevel}</span>
                      <span className="text-xs text-gray-400">{done}/{userTodos.length}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected user's todos */}
              {selectedUser && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3 sm:p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-full ${selectedColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {initials(selectedUser.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {displayName(selectedUser.todos[0]?.user ?? { email: selectedUser.email })}
                      </p>
                      <p className="text-xs text-yellow-500 font-medium">
                        Lv.{computeLevel(selectedUser.todos[0]?.user?.totalStars ?? 0)} ⭐{selectedUser.todos[0]?.user?.totalStars ?? 0}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {selectedUser.todos.filter((t) => t.completed).length}/{selectedUser.todos.length} done
                    </span>
                  </div>

                  {selectedUser.todos.length === 0 ? (
                    <p className="text-xs text-gray-400 pl-8 sm:pl-11">No todos yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {selectedUser.todos.map((todo) => (
                        <li key={todo._id} className="flex items-center gap-3 pl-8 sm:pl-11">
                          <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            todo.completed ? `${selectedColor} border-transparent` : "border-gray-300"
                          }`}>
                            {todo.completed && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm flex-1 ${todo.completed ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>
                            {todo.text}
                          </span>
                          {todo.starValue != null && (
                            <span className="text-xs text-yellow-500">⭐{todo.starValue}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

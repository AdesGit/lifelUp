"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { SignOutButton } from "@/components/SignOutButton";
import Link from "next/link";

function initials(email: string) {
  return email.split("@")[0].slice(0, 2).toUpperCase();
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
  const totalDone = todos?.filter((t: TodoItem) => t.completed).length ?? 0;
  const totalAll = todos?.length ?? 0;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
          <nav className="flex gap-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              My todos
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">Family</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Coach
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Goals
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Context
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-1 flex-col items-center gap-6 p-8 pt-10 max-w-2xl mx-auto w-full">
        <div className="w-full flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Family todos</h2>
          {totalAll > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">{totalDone}/{totalAll} done</span>
          )}
        </div>

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

        <div className="w-full space-y-6">
          {users.map(({ email, todos: userTodos }, i) => {
            const done = userTodos.filter((t) => t.completed).length;
            const color = COLORS[i % COLORS.length];
            return (
              <div key={email} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{email}</p>
                  </div>
                  <span className="text-xs text-gray-400">{done}/{userTodos.length}</span>
                </div>

                {userTodos.length === 0 ? (
                  <p className="text-xs text-gray-400 pl-11">No todos yet</p>
                ) : (
                  <ul className="space-y-2">
                    {userTodos.map((todo) => (
                      <li key={todo._id} className="flex items-center gap-3 pl-11">
                        <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          todo.completed ? `${color} border-transparent` : "border-gray-300"
                        }`}>
                          {todo.completed && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm ${todo.completed ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>
                          {todo.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

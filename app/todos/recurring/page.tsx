"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

type RecurringTodo = Doc<"recurringTodos">;

export default function RecurringTodosPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const templates = useQuery(api.recurringTodos.list);
  const create = useMutation(api.recurringTodos.create);
  const remove = useMutation(api.recurringTodos.remove);

  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newFrequency, setNewFrequency] = useState<"daily" | "weekly">("daily");
  const [saving, setSaving] = useState(false);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await create({ text: trimmed, frequency: newFrequency });
      setNewText("");
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
          <nav className="flex gap-2 text-sm flex-wrap">
            <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              My todos
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Family
            </Link>
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
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">Recurring</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Quests
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-8 pt-10 gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recurring Tasks</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              Auto-spawn as todos on their schedule
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + New
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4"
          >
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">New recurring task</h3>
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Task description…"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewFrequency("daily")}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  newFrequency === "daily"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setNewFrequency("weekly")}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  newFrequency === "weekly"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400"
                }`}
              >
                Weekly
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newText.trim() || saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setNewText(""); }}
                className="px-4 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {templates === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {templates !== null && templates?.length === 0 && !showForm && (
          <p className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
            No recurring tasks yet. Create one to get started!
          </p>
        )}

        {templates !== null && (
          <ul className="space-y-2">
            {templates?.map((t: RecurringTodo) => (
              <li
                key={t._id}
                className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
              >
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{t.text}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  t.frequency === "daily"
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                    : "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
                }`}>
                  {t.frequency === "daily" ? "Daily" : "Weekly"}
                </span>
                <span className="text-xs text-yellow-500 font-medium">
                  {t.starValue != null ? `⭐${t.starValue}` : "·"}
                </span>
                <button
                  onClick={() => remove({ id: t._id as Id<"recurringTodos"> })}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

type Todo = Doc<"todos">;
type TodoCategory = "household" | "family_help" | "training" | "school_work" | "leisure" | "other";

const CATEGORY_META: Record<TodoCategory, { label: string; stars: string; color: string; dot: string }> = {
  household:   { label: "Tâches ménagères", stars: "1-3⭐", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",   dot: "bg-blue-500" },
  family_help: { label: "Aide à la famille", stars: "2-4⭐", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",   dot: "bg-pink-500" },
  training:    { label: "Entraînement",       stars: "2-5⭐", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
  school_work: { label: "École / travail",    stars: "2-5⭐", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  leisure:     { label: "Loisirs",            stars: "1-2⭐", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",   dot: "bg-teal-500" },
  other:       { label: "Autre",              stars: "1-3⭐", color: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",       dot: "bg-gray-400" },
};

function formatNextDue(nextDueAt: number): string {
  const diff = nextDueAt - Date.now();
  if (diff <= 0) return "due now";
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function RecurringTodosPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const todos = useQuery(api.todos.list);
  const create = useMutation(api.todos.create);
  const remove = useMutation(api.todos.remove);

  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [category, setCategory] = useState<TodoCategory>("other");
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

  const recurringTodos = todos?.filter((t: Todo) => t.isRecurring) ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await create({ text: trimmed, isRecurring: true, frequency, scheduledTime, category });
      setNewText("");
      setShowForm(false);
      setCategory("other");
    } finally {
      setSaving(false);
    }
  }

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
          <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Family
          </Link>
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
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Recurring</span>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Fichiers
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Quests
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

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-10 gap-4 sm:gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recurring Tasks</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              Auto-reset at their scheduled time · you can also create them from the main todo list
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
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3 sm:p-5 space-y-4"
          >
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">New recurring task</h3>
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Task description…"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFrequency("daily")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    frequency === "daily"
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400"
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency("weekly")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    frequency === "weekly"
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400"
                  }`}
                >
                  Weekly
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400">UTC</span>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TodoCategory)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(CATEGORY_META) as TodoCategory[]).map((key) => (
                  <option key={key} value={key}>{CATEGORY_META[key].label} · {CATEGORY_META[key].stars}</option>
                ))}
              </select>
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

        {todos === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {todos !== undefined && recurringTodos.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="text-4xl">🔄</div>
            <p className="text-gray-900 dark:text-white font-medium">No recurring tasks yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              Create one here or toggle &ldquo;Recurring&rdquo; when adding a task from the main list.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {recurringTodos.map((t: Todo) => {
            const cat = (t.category ?? "other") as TodoCategory;
            const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
            return (
            <li
              key={t._id}
              className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
            >
              <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                t.completed ? "bg-green-500 border-green-500" : "border-gray-300 dark:border-gray-600"
              }`}>
                {t.completed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${t.completed ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"}`}>
                  {t.text}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${meta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                    <span className="opacity-70">· {meta.stars}</span>
                  </span>
                  <span className="text-xs text-blue-400">
                    {t.frequency === "daily" ? "Quotidien" : "Hebdo"} · {t.scheduledTime} UTC
                    {t.completed && t.nextDueAt != null && (
                      <span className="text-gray-400"> · reset dans {formatNextDue(t.nextDueAt)}</span>
                    )}
                  </span>
                </div>
              </div>
              <span className="text-xs text-yellow-500 font-medium flex-shrink-0">
                {t.starValue != null ? `⭐${t.starValue}` : <span className="text-gray-300 dark:text-gray-600 text-xs italic">eval…</span>}
              </span>
              <button
                onClick={() => remove({ id: t._id as Id<"todos"> })}
                className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                aria-label="Delete"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          );
          })}
        </ul>
      </div>
    </main>
  );
}

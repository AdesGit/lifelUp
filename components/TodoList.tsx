"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";

function formatNextDue(nextDueAt: number): string {
  const diff = nextDueAt - Date.now();
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (diff <= 0) return "due now";
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function TodoList() {
  const todos = useQuery(api.todos.list);
  const create = useMutation(api.todos.create);
  const toggle = useMutation(api.todos.toggle);
  const remove = useMutation(api.todos.remove);

  const [text, setText] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [scheduledTime, setScheduledTime] = useState("09:00");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    await create({
      text: trimmed,
      isRecurring: isRecurring || undefined,
      frequency: isRecurring ? frequency : undefined,
      scheduledTime: isRecurring ? scheduledTime : undefined,
    });
    setText("");
    setIsRecurring(false);
  }

  const done = todos?.filter((t: Doc<"todos">) => t.completed).length ?? 0;
  const total = todos?.length ?? 0;

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Todos</h2>
        {total > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">{done}/{total} done</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a task…"
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        {/* Recurring toggle */}
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => setIsRecurring(!isRecurring)}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              isRecurring ? "text-blue-600 dark:text-blue-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recurring
          </button>

          {isRecurring && (
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">UTC</span>
            </div>
          )}
        </div>
      </form>

      {todos === undefined && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      )}

      {todos?.length === 0 && (
        <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">
          No tasks yet. Add one above!
        </p>
      )}

      <ul className="space-y-2">
        {todos?.map((todo: Doc<"todos">) => (
          <li
            key={todo._id}
            className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 group"
          >
            <button
              onClick={() => toggle({ id: todo._id as Id<"todos"> })}
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                todo.completed
                  ? "bg-green-500 border-green-500"
                  : "border-gray-400 hover:border-blue-500"
              }`}
            >
              {todo.completed && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <span className={`text-sm ${todo.completed ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"}`}>
                {todo.text}
              </span>
              {todo.isRecurring && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-xs text-blue-400">
                    {todo.frequency === "daily" ? "Daily" : "Weekly"} · {todo.scheduledTime} UTC
                    {todo.completed && todo.nextDueAt != null && (
                      <span className="text-gray-400"> · resets in {formatNextDue(todo.nextDueAt)}</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <span className="text-xs text-yellow-500 font-medium flex-shrink-0">
              {todo.starValue != null ? `⭐${todo.starValue}` : "·"}
            </span>

            <button
              onClick={() => remove({ id: todo._id as Id<"todos"> })}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
              aria-label="Delete"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

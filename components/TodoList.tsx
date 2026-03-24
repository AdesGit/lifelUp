"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";

export function TodoList() {
  const todos = useQuery(api.todos.list);
  const create = useMutation(api.todos.create);
  const toggle = useMutation(api.todos.toggle);
  const remove = useMutation(api.todos.remove);
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    await create({ text: trimmed });
    setText("");
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

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-lg transition-colors"
        >
          Add
        </button>
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

            <span className={`flex-1 text-sm ${todo.completed ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"}`}>
              {todo.text}
            </span>

            <button
              onClick={() => remove({ id: todo._id as Id<"todos"> })}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
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

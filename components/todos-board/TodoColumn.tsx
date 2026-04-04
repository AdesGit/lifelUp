"use client";

import { Doc } from "@/convex/_generated/dataModel";
import { COLOR_PALETTE } from "@/components/calendar/EventChip";

type User = Doc<"users">;
type Todo = Doc<"todos">;

const CATEGORY_LABELS: Record<string, string> = {
  household: "Maison",
  family_help: "Famille",
  training: "Sport",
  school_work: "École",
  leisure: "Loisir",
  other: "Autre",
};

function displayName(user: User): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  return (user.email ?? "").split("@")[0];
}

function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt(totalStars / 5)) + 1;
}

function initials(user: User): string {
  if (user.firstName) return user.firstName.slice(0, 2).toUpperCase();
  return (user.email ?? "??").slice(0, 2).toUpperCase();
}

function formatDueAt(dueAt: number): string {
  const d = new Date(dueAt);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface TodoColumnProps {
  user: User;
  todos: Todo[];
  colorIndex: number;
  canComplete?: boolean;
  onComplete?: (id: string) => void;
}

export default function TodoColumn({ user, todos, colorIndex, canComplete, onComplete }: TodoColumnProps) {
  const colors = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  const level = computeLevel(user.totalStars ?? 0);

  return (
    <div className="flex flex-col min-w-[220px] flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className={`${colors.bg} p-3`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center text-white text-xs font-bold">
            {initials(user)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{displayName(user)}</p>
            <p className="text-xs text-white/80">Lv.{level} · ⭐{user.totalStars ?? 0}</p>
          </div>
        </div>
        <p className="text-xs text-white/70 mt-1">{todos.length} todo{todos.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {todos.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Aucun todo</p>
        )}
        {todos.map((todo) => (
          <div key={todo._id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 group">
            {canComplete && onComplete && (
              <button
                onClick={() => onComplete(todo._id)}
                className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 ${colors.bg.replace("bg-", "border-")} hover:opacity-80 transition-opacity`}
                title="Marquer comme fait"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-800 dark:text-gray-200 leading-tight">{todo.text}</p>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {todo.category && todo.category !== "other" && (
                  <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1 rounded">
                    {CATEGORY_LABELS[todo.category] ?? todo.category}
                  </span>
                )}
                {todo.dueAt && (
                  <span className="text-[10px] text-gray-400">{formatDueAt(todo.dueAt)}</span>
                )}
                {todo.starValue != null && (
                  <span className="text-[10px] text-yellow-500">⭐{todo.starValue}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

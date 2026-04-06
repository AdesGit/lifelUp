"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRef, useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";

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
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (diff <= 0) return "due now";
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function shortName(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!user) return "?";
  if (user.firstName) return user.firstName;
  return (user.email ?? "").split("@")[0];
}

// Sub-component: shows 📎 badge with attachment count (isolated to avoid conditional hook calls)
function AttachmentBadge({ todoId, onClick }: { todoId: Id<"todos">; onClick: () => void }) {
  const attachments = useQuery(api.uploads.listByTodo, { todoId });
  const count = attachments?.length ?? 0;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-0.5 text-xs transition-colors flex-shrink-0 ${
        count > 0
          ? "text-blue-500 hover:text-blue-400"
          : "text-gray-300 dark:text-gray-600 hover:text-gray-500"
      }`}
      aria-label="Pièces jointes"
    >
      📎{count > 0 && <span className="font-medium">{count}</span>}
    </button>
  );
}

// Modal: shows existing attachments for a todo + upload button
function AttachmentModal({ todoId, onClose }: { todoId: Id<"todos">; onClose: () => void }) {
  const attachments = useQuery(api.uploads.listByTodo, { todoId });
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const confirmUpload = useMutation(api.uploads.confirmUpload);
  const removeUpload = useMutation(api.uploads.remove);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_SIZE = 10 * 1024 * 1024;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      setError("Fichier trop volumineux (max 10 Mo)");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload échoué");
      const { storageId } = await res.json();
      await confirmUpload({
        storageId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        todoId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pièces jointes</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {attachments === undefined && (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {attachments?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucune pièce jointe</p>
        )}

        {(attachments?.length ?? 0) > 0 && (
          <ul className="space-y-2 mb-4">
            {attachments?.map((a) => (
              <li key={a._id} className="flex items-center gap-2 group">
                {a.mimeType.startsWith("image/") && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.filename} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm flex-shrink-0">
                    {a.mimeType === "application/pdf" ? "📄" : "📎"}
                  </div>
                )}
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{a.filename}</span>
                {a.url && (
                  <a
                    href={a.url}
                    download={a.filename}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-500 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={() => removeUpload({ id: a._id as Id<"uploads"> })}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          id="attach-file-input"
          onChange={handleFile}
        />
        <label
          htmlFor="attach-file-input"
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Upload en cours…" : "📎 Ajouter un fichier"}
        </label>
      </div>
    </div>
  );
}

export function TodoList() {
  const todos = useQuery(api.todos.list);
  const me = useQuery(api.users.getMe);
  const allUsers = useQuery(api.users.listAll);
  const create = useMutation(api.todos.create);
  const createForUser = useMutation(api.todos.createForUser);
  const toggle = useMutation(api.todos.toggle);
  const remove = useMutation(api.todos.remove);

  const [text, setText] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [category, setCategory] = useState<TodoCategory>("other");
  const [attachTodoId, setAttachTodoId] = useState<Id<"todos"> | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // null = current user; set to a family member's ID to assign task to them
  const [targetUserId, setTargetUserId] = useState<Id<"users"> | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    if (targetUserId && targetUserId !== me?._id) {
      await createForUser({ targetUserId, text: trimmed, category });
    } else {
      await create({
        text: trimmed,
        isRecurring: isRecurring || undefined,
        frequency: isRecurring ? frequency : undefined,
        scheduledTime: isRecurring ? scheduledTime : undefined,
        category,
      });
    }
    setText("");
    setIsRecurring(false);
    setCategory("other");
  }

  // Split todos for filtering
  const completedTodos = todos?.filter((t: Doc<"todos">) => t.completed) ?? [];
  const incompleteTodos = todos?.filter((t: Doc<"todos">) => !t.completed) ?? [];
  const visibleTodos = showCompleted ? todos : incompleteTodos;
  const total = todos?.length ?? 0;

  // Family members excluding current user
  const otherUsers = allUsers?.filter((u) => u._id !== me?._id) ?? [];

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Todos</h2>
        {total > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {incompleteTodos.length} à faire · {completedTodos.length} terminées
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        {/* User selector — only shown when there are other family members */}
        {otherUsers.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap px-1">
            <span className="text-xs text-gray-400 flex-shrink-0">Pour :</span>
            <button
              type="button"
              onClick={() => setTargetUserId(null)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                targetUserId === null
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Moi
            </button>
            {otherUsers.map((u) => (
              <button
                key={u._id}
                type="button"
                onClick={() => setTargetUserId(u._id as Id<"users">)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  targetUserId === u._id
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {shortName(u)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              targetUserId
                ? `Tâche pour ${shortName(allUsers?.find((u) => u._id === targetUserId))}…`
                : "Add a task…"
            }
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

        {/* Recurring toggle + category — only when creating for self */}
        {!targetUserId && (
          <div className="flex flex-wrap items-center gap-2 px-1">
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
              Récurrent
            </button>

            {isRecurring && (
              <>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="daily">Quotidien</option>
                  <option value="weekly">Hebdo</option>
                </select>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400">UTC</span>
              </>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_META[category].dot}`} />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TodoCategory)}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {(Object.keys(CATEGORY_META) as TodoCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_META[key].label} · {CATEGORY_META[key].stars}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Category selector when creating for another user */}
        {targetUserId && (
          <div className="flex items-center gap-1.5 px-1 ml-auto justify-end">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${CATEGORY_META[category].dot}`} />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TodoCategory)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(Object.keys(CATEGORY_META) as TodoCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_META[key].label} · {CATEGORY_META[key].stars}
                </option>
              ))}
            </select>
          </div>
        )}
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

      {incompleteTodos.length === 0 && completedTodos.length > 0 && !showCompleted && (
        <p className="text-center text-gray-400 dark:text-gray-500 py-4 text-sm">
          Toutes les tâches sont terminées !
        </p>
      )}

      <ul className="space-y-2">
        {visibleTodos?.map((todo: Doc<"todos">) => {
          const cat = (todo.category ?? "other") as TodoCategory;
          const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
          return (
            <li
              key={todo._id}
              className={`flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 border group ${
                todo.completed
                  ? "border-gray-100 dark:border-gray-700/50 opacity-60"
                  : "border-gray-200 dark:border-gray-700"
              }`}
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
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${meta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                    <span className="opacity-70">· {meta.stars}</span>
                  </span>
                  {todo.isRecurring && (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {todo.frequency === "daily" ? "Quotidien" : "Hebdo"} · {todo.scheduledTime} UTC
                      {todo.completed && todo.nextDueAt != null && (
                        <span className="text-gray-400"> · reset dans {formatNextDue(todo.nextDueAt)}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <AttachmentBadge
                todoId={todo._id as Id<"todos">}
                onClick={() => setAttachTodoId(todo._id as Id<"todos">)}
              />

              <span className="text-xs text-yellow-500 font-medium flex-shrink-0">
                {todo.starValue != null ? `⭐${todo.starValue}` : <span className="text-gray-300 dark:text-gray-600 text-xs italic">eval…</span>}
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
          );
        })}
      </ul>

      {/* Completed todos toggle */}
      {completedTodos.length > 0 && (
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-2 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${showCompleted ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {showCompleted
            ? "Masquer les tâches terminées"
            : `Afficher ${completedTodos.length} tâche${completedTodos.length > 1 ? "s" : ""} terminée${completedTodos.length > 1 ? "s" : ""}`}
        </button>
      )}

      {attachTodoId && (
        <AttachmentModal
          todoId={attachTodoId}
          onClose={() => setAttachTodoId(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useState } from "react";

type Todo = Doc<"todos">;

interface EventModalProps {
  mode: "create" | "edit";
  todo?: Todo;
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function EventModal({ mode, todo, defaultDate, onClose, onSaved }: EventModalProps) {
  const createWithDueAt = useMutation(api.todos.createWithDueAt);
  const updateDueAt = useMutation(api.todos.updateDueAt);
  const patchTitle = useMutation(api.todos.patchTitle);
  const toggle = useMutation(api.todos.toggle);

  const initialDate = todo?.dueAt ? new Date(todo.dueAt) : (defaultDate ?? new Date());
  const [text, setText] = useState(todo?.text ?? "");
  const [dateVal, setDateVal] = useState(toDateInputValue(initialDate));
  const [timeVal, setTimeVal] = useState(todo?.dueAt ? toTimeInputValue(initialDate) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      // Build timestamp
      const [year, month, day] = dateVal.split("-").map(Number);
      let dueAt: number;
      if (timeVal) {
        const [h, m] = timeVal.split(":").map(Number);
        dueAt = new Date(year, month - 1, day, h, m).getTime();
      } else {
        dueAt = new Date(year, month - 1, day, 12, 0).getTime();
      }

      if (mode === "create") {
        await createWithDueAt({ text: text.trim(), dueAt });
      } else if (todo) {
        await patchTitle({ id: todo._id as Id<"todos">, text: text.trim() });
        await updateDueAt({ id: todo._id as Id<"todos">, dueAt });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!todo) return;
    setSaving(true);
    try {
      await toggle({ id: todo._id as Id<"todos"> });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {mode === "create" ? "Nouveau todo" : "Modifier le todo"}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titre</label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex: Appel médecin"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure (optionnel)</label>
            <input
              type="time"
              value={timeVal}
              onChange={(e) => setTimeVal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            {mode === "edit" && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="py-2 px-3 border border-red-300 text-red-600 font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !text.trim()}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {saving ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

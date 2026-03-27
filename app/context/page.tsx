"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

type ContextEntry = Doc<"contextEntries">;
type Category = ContextEntry["category"];

const CATEGORY_LABELS: Record<Category, string> = {
  business: "Business",
  people:   "People",
  network:  "Network / IT",
  tools:    "Tools",
  home:     "Home",
  other:    "Other",
};

const CATEGORY_COLORS: Record<Category, string> = {
  business: "text-blue-700   bg-blue-50   dark:text-blue-400  dark:bg-blue-950",
  people:   "text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950",
  network:  "text-green-700  bg-green-50  dark:text-green-400  dark:bg-green-950",
  tools:    "text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-950",
  home:     "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950",
  other:    "text-gray-700   bg-gray-100  dark:text-gray-400   dark:bg-gray-800",
};

const CATEGORY_ORDER: Category[] = ["people", "business", "network", "tools", "home", "other"];

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; entry: ContextEntry };

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: ContextEntry;
  onEdit: (e: ContextEntry) => void;
  onDelete: (id: Id<"contextEntries">) => void;
}) {
  return (
    <div className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-gray-900 dark:text-white leading-snug">{entry.title}</h4>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {entry.source === "ai" && (
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">AI</span>
          )}
          <button
            onClick={() => onEdit(entry)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(entry._id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-6">
        {entry.content}
      </p>

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span key={tag} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryModal({
  state,
  onClose,
  onCreate,
  onUpdate,
}: {
  state: ModalState;
  onClose: () => void;
  onCreate: (data: { title: string; category: Category; content: string; tags: string[] }) => Promise<void>;
  onUpdate: (id: Id<"contextEntries">, data: { title: string; category: Category; content: string; tags: string[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState(state.mode === "edit" ? state.entry.title : "");
  const [category, setCategory] = useState<Category>(state.mode === "edit" ? state.entry.category : "other");
  const [content, setContent] = useState(state.mode === "edit" ? state.entry.content : "");
  const [tagsRaw, setTagsRaw] = useState(state.mode === "edit" ? state.entry.tags.join(", ") : "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      if (state.mode === "edit") {
        await onUpdate(state.entry._id, { title: title.trim(), category, content: content.trim(), tags });
      } else {
        await onCreate({ title: title.trim(), category, content: content.trim(), tags });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 w-full max-w-lg shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {state.mode === "edit" ? "Edit entry" : "New context entry"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Autopro — company overview"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the details — IP addresses, key people, how things work, anything worth remembering…"
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="e.g. autopro, réseau, serveur"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : state.mode === "edit" ? "Save changes" : "Add entry"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ContextPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const entries = useQuery(api.context.list);
  const createEntry = useMutation(api.context.create);
  const updateEntry = useMutation(api.context.update);
  const removeEntry = useMutation(api.context.remove);

  const [modal, setModal] = useState<ModalState>({ mode: "closed" });

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

  const handleDelete = async (id: Id<"contextEntries">) => {
    if (!confirm("Delete this entry?")) return;
    await removeEntry({ id });
  };

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
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Context</span>
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
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-10 gap-6 sm:gap-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Family context</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              Knowledge base shared with all AI assistants · add anything worth remembering
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: "add" })}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            + Add entry
          </button>
        </div>

        {entries === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {entries !== undefined && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="text-5xl">🗂️</div>
            <p className="text-gray-900 dark:text-white font-medium">No context entries yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              Add anything you want the AI to know — business details, key people, network setup, tools you use…
            </p>
            <button
              onClick={() => setModal({ mode: "add" })}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Add your first entry →
            </button>
          </div>
        )}

        {CATEGORY_ORDER.map((category) => {
          const categoryEntries = (entries ?? []).filter((e) => e.category === category);
          if (categoryEntries.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[category]}`}>
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="text-xs text-gray-400">
                  {categoryEntries.length} {categoryEntries.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              {categoryEntries.map((entry) => (
                <EntryCard
                  key={entry._id}
                  entry={entry}
                  onEdit={(e) => setModal({ mode: "edit", entry: e })}
                  onDelete={handleDelete}
                />
              ))}
            </section>
          );
        })}
      </div>

      {modal.mode !== "closed" && (
        <EntryModal
          state={modal}
          onClose={() => setModal({ mode: "closed" })}
          onCreate={async (data) => { await createEntry(data); }}
          onUpdate={async (id, data) => { await updateEntry({ id, ...data }); }}
        />
      )}
    </main>
  );
}

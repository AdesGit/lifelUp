# PRP: File & Photo Upload (Cloud Documents)

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: filled from `INITIAL.md` via `/generate-prp`

---

## Overview

Allow family members to upload files (photos, PDFs, any type ≤ 10 MB) either attached to a specific todo or into a general `/fichiers` library. Files are stored in Convex native storage. Metadata is saved so a future agent can add AI descriptions/summaries.

---

## Success Criteria

- [ ] A 📎 button appears on each todo item in the list — clicking opens an attachment modal
- [ ] The modal shows existing attachments for that todo + an "Ajouter" button to upload a new file
- [ ] A badge `📎 N` shows attachment count when a todo has files attached
- [ ] A `/fichiers` page is accessible from the nav — lists all uploads for the current user
- [ ] `/fichiers` has a search bar that filters by filename (and description once agent fills it)
- [ ] General upload (not tied to a todo) is possible from the `/fichiers` page
- [ ] File size limit: 10 MB — enforced client-side with a visible error message
- [ ] Metadata stored per upload: `userId`, `uploadedAt`, `todoId` (opt), `filename`, `mimeType`, `size`, `storageId`, `description` (empty), `summary` (empty), `links` (empty)
- [ ] Download link works for each uploaded file
- [ ] Image files show a thumbnail
- [ ] Deleting a file removes it from Convex storage AND the `uploads` table
- [ ] "Fichiers" link added to the nav header on ALL pages (between Récurrent and Quests)
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] Unauthenticated users redirected to `/signin`
- [ ] Convex deploy succeeds with new `uploads` table
- [ ] Manual verification: upload a photo from a todo → badge appears on todo, file visible on `/fichiers`

---

## Context Files to Read Before Implementing

- `convex/schema.ts` — current tables and index names
- `convex/_generated/api.d.ts` — must update when adding new module
- `examples/convex-mutation.ts` — CRUD pattern
- `examples/app-page.tsx` — protected page skeleton with exact nav header
- `convex/goals.ts` + `app/goals/page.tsx` — most similar backend + page pattern
- `app/page.tsx` — profile modal pattern (useState + form + overlay)
- `components/TodoList.tsx` — current todo list, must add 📎 button here

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/schema.ts` | Modify | Add `uploads` table |
| `convex/_generated/api.d.ts` | Modify | Add `uploads` import + fullApi entry |
| `convex/uploads.ts` | Create | generateUploadUrl, confirmUpload, listByUser, listByTodo, remove |
| `app/fichiers/page.tsx` | Create | Protected file library page |
| `components/TodoList.tsx` | Modify | Add 📎 button + attachment modal per todo |
| `app/page.tsx` | Modify | Add "Fichiers" nav link |
| `app/family/page.tsx` | Modify | Add "Fichiers" nav link |
| `app/goals/page.tsx` | Modify | Add "Fichiers" nav link |
| `app/coach/page.tsx` | Modify | Add "Fichiers" nav link |
| `app/context/page.tsx` | Modify | Add "Fichiers" nav link |
| `app/todos/recurring/page.tsx` | Modify | Add "Fichiers" nav link |
| `app/quests/page.tsx` | Modify | Add "Fichiers" nav link |

---

## Tasks

### Task 1: Schema
**File:** `convex/schema.ts`
**Action:** Modify — add `uploads` table after the `goals` table
**Depends on:** nothing

```typescript
uploads: defineTable({
  userId: v.id("users"),
  uploadedAt: v.number(),
  todoId: v.optional(v.id("todos")),
  filename: v.string(),
  mimeType: v.string(),
  size: v.number(),                        // bytes
  storageId: v.id("_storage"),
  description: v.optional(v.string()),     // filled by future agent
  summary: v.optional(v.string()),         // filled by future agent
  links: v.optional(v.array(v.string())),  // filled by future agent
})
  .index("by_user", ["userId"])
  .index("by_todo", ["todoId"])
  .index("by_user_uploaded", ["userId", "uploadedAt"]),
```

Note: NO `fingerprint` field — uploads are user-initiated, not agent-inserted. The future description agent will only `patch` existing records, not insert new ones.

---

### Task 2: Update api.d.ts
**File:** `convex/_generated/api.d.ts`
**Action:** Modify — add `uploads` module
**Depends on:** Task 1
**⚠️ Must be done BEFORE Task 6 (npm run build)**

```typescript
// Add at top with other imports (alphabetical order — after "todos", before "users"):
import type * as uploads from "../uploads.js";

// Add to fullApi ApiFromModules<{...}> (alphabetical — after todos, before users):
uploads: typeof uploads;
```

---

### Task 3: Convex Module
**File:** `convex/uploads.ts`
**Action:** Create
**Depends on:** Task 1, Task 2

```typescript
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Step 1 of upload flow: returns a short-lived POST URL
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

// Step 2: after POSTing the file, save metadata
export const confirmUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    todoId: v.optional(v.id("todos")),
  },
  handler: async (ctx, { storageId, filename, mimeType, size, todoId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("uploads", {
      userId,
      uploadedAt: Date.now(),
      todoId,
      filename,
      mimeType,
      size,
      storageId,
    });
  },
});

// Returns all uploads for the current user, newest first
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    // Attach download URL to each upload
    return Promise.all(
      uploads.map(async (u) => ({
        ...u,
        url: await ctx.storage.getUrl(u.storageId),
      }))
    );
  },
});

// Returns uploads for a specific todo
export const listByTodo = query({
  args: { todoId: v.id("todos") },
  handler: async (ctx, { todoId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_todo", (q) => q.eq("todoId", todoId))
      .collect();
    // Only return uploads that belong to this user
    const mine = uploads.filter((u) => u.userId === userId);
    return Promise.all(
      mine.map(async (u) => ({
        ...u,
        url: await ctx.storage.getUrl(u.storageId),
      }))
    );
  },
});

// Delete upload: removes from storage AND the table
export const remove = mutation({
  args: { id: v.id("uploads") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const upload = await ctx.db.get(id);
    if (!upload || upload.userId !== userId) throw new Error("Not found");
    await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(id);
  },
});
```

---

### Task 4: File Library Page
**File:** `app/fichiers/page.tsx`
**Action:** Create
**Depends on:** Task 3

Copy the nav header verbatim from `app/goals/page.tsx` and update active item to "Fichiers".

Key elements:
- Auth guard + redirect to `/signin` (same `useEffect` pattern)
- Loading spinner while `isLoading || !isAuthenticated`
- `const uploads = useQuery(api.uploads.listByUser)` — `undefined` = loading
- Search bar: `useState<string>` + filter uploads by `filename.toLowerCase().includes(search.toLowerCase()) || (u.description ?? "").toLowerCase().includes(search.toLowerCase())`
- Upload button: triggers file picker, enforces 10 MB client-side, calls `generateUploadUrl` → POST → `confirmUpload`
- File list: each item shows type badge (🖼 image, 📄 PDF, 📎 other), filename, size (formatted), date, todo link if attached, download button, delete button

```typescript
"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

type Upload = Doc<"uploads"> & { url: string | null };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType === "application/pdf") return "📄";
  return "📎";
}

export default function FichiersPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const uploads = useQuery(api.uploads.listByUser);
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const confirmUpload = useMutation(api.uploads.confirmUpload);
  const removeUpload = useMutation(api.uploads.remove);

  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      setUploadError("Fichier trop volumineux (max 10 Mo)");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload échoué");
      const { storageId } = await res.json();
      await confirmUpload({
        storageId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filtered = (uploads ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.filename.toLowerCase().includes(q) ||
      (u.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">My todos</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Family</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Coach</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Goals</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Context</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Recurring</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Fichiers</span>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Quests</Link>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-10 gap-4 sm:gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mes fichiers</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Photos, documents et pièces jointes</p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              id="global-file-input"
              onChange={handleFileSelect}
            />
            <label
              htmlFor="global-file-input"
              className={`inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
            >
              {uploading ? "Upload…" : "+ Ajouter"}
            </label>
          </div>
        </div>

        {uploadError && (
          <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
        )}

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou description…"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />

        {uploads === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {uploads !== undefined && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="text-4xl">📁</div>
            <p className="text-gray-900 dark:text-white font-medium">
              {search ? "Aucun fichier trouvé" : "Aucun fichier pour l'instant"}
            </p>
            {!search && (
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
                Clique sur &ldquo;+ Ajouter&rdquo; ou utilise le bouton 📎 sur une tâche.
              </p>
            )}
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((upload) => (
            <li
              key={upload._id}
              className="flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 group"
            >
              {/* Thumbnail for images, icon for others */}
              {upload.mimeType.startsWith("image/") && upload.url ? (
                <img
                  src={upload.url}
                  alt={upload.filename}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">
                  {fileIcon(upload.mimeType)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{upload.filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatSize(upload.size)} · {new Date(upload.uploadedAt).toLocaleDateString("fr-FR")}
                  {upload.todoId && <span className="ml-1">· tâche liée</span>}
                </p>
                {upload.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{upload.description}</p>
                )}
              </div>

              {upload.url && (
                <a
                  href={upload.url}
                  download={upload.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
                  aria-label="Télécharger"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              )}

              <button
                onClick={() => removeUpload({ id: upload._id as Id<"uploads"> })}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                aria-label="Supprimer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
```

---

### Task 5: Add 📎 button to TodoList
**File:** `components/TodoList.tsx`
**Action:** Modify — add attachment button + modal per todo
**Depends on:** Task 3

Add at the top of the file:
```typescript
import { useRef } from "react"; // add to existing useState import
```

Add new state in `TodoList()`:
```typescript
const [attachTodoId, setAttachTodoId] = useState<Id<"todos"> | null>(null);
```

Add new mutations:
```typescript
const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
const confirmUpload = useMutation(api.uploads.confirmUpload);
const removeUpload = useMutation(api.uploads.remove);
```

Add per-todo attachment query using a sub-component to avoid calling hooks conditionally:

Create a small inline component `TodoAttachments` that receives `todoId` and calls `useQuery(api.uploads.listByTodo, { todoId })`.

**Attachment modal logic** (inline in TodoList, shown when `attachTodoId !== null`):
- Shows a fixed overlay (same pattern as profile modal in `app/page.tsx`)
- Queries `api.uploads.listByTodo` for `attachTodoId`
- Lists existing attachments with thumbnail/icon, filename, date, download link, delete button
- File input (hidden) + "Ajouter un fichier" button label
- Max 10 MB client-side check
- Upload flow: `generateUploadUrl()` → `fetch(url, { method: "POST", body: file })` → `confirmUpload({ storageId, filename, mimeType, size, todoId: attachTodoId })`

**📎 badge in todo list item** (add before the ⭐ stars span):
```typescript
// Attachment count badge — uses a sub-component to avoid conditional hook call
<AttachmentBadge todoId={todo._id as Id<"todos">} onClick={() => setAttachTodoId(todo._id as Id<"todos">)} />
```

Sub-component (add outside `TodoList`):
```typescript
function AttachmentBadge({ todoId, onClick }: { todoId: Id<"todos">; onClick: () => void }) {
  const attachments = useQuery(api.uploads.listByTodo, { todoId });
  const count = attachments?.length ?? 0;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-0.5 text-xs transition-colors flex-shrink-0 ${
        count > 0 ? "text-blue-500 hover:text-blue-400" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"
      }`}
      aria-label="Pièces jointes"
    >
      📎{count > 0 && <span className="font-medium">{count}</span>}
    </button>
  );
}
```

**Attachment modal component** (add outside `TodoList`):
```typescript
function AttachmentModal({
  todoId,
  onClose,
}: {
  todoId: Id<"todos">;
  onClose: () => void;
}) {
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
    if (file.size > MAX_SIZE) { setError("Fichier trop volumineux (max 10 Mo)"); return; }
    setError(null);
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
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
                  <img src={a.url} alt={a.filename} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm flex-shrink-0">
                    {a.mimeType === "application/pdf" ? "📄" : "📎"}
                  </div>
                )}
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{a.filename}</span>
                {a.url && (
                  <a href={a.url} download={a.filename} target="_blank" rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-500 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                )}
                <button onClick={() => removeUpload({ id: a._id as Id<"uploads"> })}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        <input ref={fileInputRef} type="file" className="hidden" id="attach-file-input" onChange={handleFile} />
        <label htmlFor="attach-file-input"
          className={`w-full flex items-center justify-center gap-2 py-2 px-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Upload en cours…" : "📎 Ajouter un fichier"}
        </label>
      </div>
    </div>
  );
}
```

In `TodoList` JSX, add before closing `</div>`:
```typescript
{attachTodoId && (
  <AttachmentModal todoId={attachTodoId} onClose={() => setAttachTodoId(null)} />
)}
```

In each todo `<li>`, add `<AttachmentBadge>` just before the `⭐` stars span:
```typescript
<AttachmentBadge
  todoId={todo._id as Id<"todos">}
  onClick={() => setAttachTodoId(todo._id as Id<"todos">)}
/>
```

---

### Task 6: Add "Fichiers" nav link to all pages
**Files:** `app/page.tsx`, `app/family/page.tsx`, `app/goals/page.tsx`, `app/coach/page.tsx`, `app/context/page.tsx`, `app/todos/recurring/page.tsx`, `app/quests/page.tsx`
**Action:** Modify — add nav link between "Récurrent" and "Quests"
**Depends on:** Task 4

In every nav, after the "Recurring" link + separator and before "Quests":
```typescript
<span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
<Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
  Fichiers
</Link>
```

On the `/fichiers` page itself, this link is the active `<span>` instead of a `<Link>`.

---

### Task 7: Build Validation
**Action:** Run
**Depends on:** Tasks 1–6

```bash
npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

Fix all TypeScript/lint errors before deploying.

---

### Task 8: Convex Deploy
**Action:** Run
**Depends on:** Task 7

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

Watch for: `uploads` table added, 3 indexes created (`by_user`, `by_todo`, `by_user_uploaded`).

---

## Validation Sequence

```bash
# 1. Build
npm run build 2>&1 | tail -20

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. Convex deploy
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# 4. Production deploy
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
pm2 save

# 5. Manual verification
# Open https://lifelup.aidigitalassistant.cloud
# → "Fichiers" nav link visible on all pages
# → /fichiers loads, shows empty state
# → Click "+ Ajouter", pick an image → uploads, thumbnail visible
# → Go back to todo list, click 📎 on a todo, add a file → badge shows "📎 1"
# → On /fichiers, search bar filters correctly
```

---

## Known Risks

- **api.d.ts update required** before `npm run build` — forgetting this causes cryptic TS errors
- **`npx convex deploy` required** after schema.ts change
- **Convex `ctx.storage.getUrl()` may return `null`** if file was deleted externally — the `url` field will be `null`, handle with `?? "#"` or conditionally render download link
- **Upload URL is short-lived** (~1 minute) — don't store it, use immediately after `generateUploadUrl()`
- **`storageId` in the POST response** — Convex returns `{ storageId: "..." }` as JSON after a successful file POST to the upload URL — parse it with `res.json()`
- **`v.id("_storage")` type** — Convex's special type for storage IDs; ensure schema uses exactly this, not `v.string()`
- **7 nav files to update** — easy to miss one; check all pages listed in Affected Files

---

## Confidence Score

**Score:** 8/10
**Reason:** Convex storage is confirmed working on this self-hosted instance (storage dir exists). The upload flow (`generateUploadUrl` → POST → `confirmUpload`) is standard Convex pattern. Minor uncertainty: exact JSON response shape from Convex storage POST (`{ storageId }` vs `{ storageId: "..." }`) — this is well-documented in Convex docs. All other patterns are identical to existing features.

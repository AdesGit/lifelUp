# PRP: User Profiles, Levels, Todo Categories & Smart Star Evaluator

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS

---

## Overview
Four connected gamification improvements: user profiles with first/last name, a level system computed from total stars, todo categories with a scoring rubric, and an upgraded AI star evaluator that uses category + effort to assign contextually appropriate star values.

---

## Success Criteria
- [ ] Users can edit their first name and last name via a profile modal in the home header
- [ ] Nav header shows `firstName lastName` (or email prefix if not set) + `Lv.N ⭐total`
- [ ] Level badge `Lv.N` appears on family tab for each user
- [ ] Level formula: `Math.floor(Math.sqrt(totalStars / 5)) + 1` (Level 1 at 0 stars, Level 5 at ~80 stars)
- [ ] Every todo has a `category` field; default is `"other"` if not set
- [ ] Category selector (compact dropdown) appears in TodoList create form
- [ ] Category selector also appears in recurring todos create form (`app/todos/recurring/page.tsx`)
- [ ] Star evaluator agent uses category + task text with the category rubric to assign 1–5 stars
- [ ] `GET /agent/v1/todos-unevaluated` returns `category` field in each item
- [ ] `npm run build` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint warnings
- [ ] `npx convex deploy` succeeds (schema updated with new fields)
- [ ] Manual: create a todo with category "Entraînement / sport", wait ≤5min → star evaluator assigns 2–5 stars
- [ ] Manual: set first/last name in profile modal → header updates immediately

---

## Context Files to Read Before Implementing

```
convex/schema.ts                  — current users + todos tables (fields to add)
convex/users.ts                   — existing getMe query (add updateProfile mutation here)
convex/todos.ts                   — existing create mutation (add category arg), getUnevaluatedTodos (add category to return)
convex/http.ts                    — todos-unevaluated endpoint (update to return category)
convex/_generated/api.d.ts        — no new module needed, but verify users/todos are listed
app/page.tsx                      — home page header (add profile modal + level display)
app/family/page.tsx               — family tab (add Lv.N badge per user)
app/todos/recurring/page.tsx      — recurring form (add category selector)
components/TodoList.tsx           — create form (add category selector)
app/context/page.tsx              — modal + category select pattern to copy
lifelup-agent/star-evaluator.mjs  — upgrade this file's prompt with rubric + category
examples/convex-mutation.ts       — mutation pattern with v validators
```

---

## Affected Files

| File | Action | What Changes |
|------|--------|--------------|
| `convex/schema.ts` | Modify | Add `firstName`, `lastName` to `users`; add `category` to `todos` |
| `convex/users.ts` | Modify | Add `updateProfile` mutation |
| `convex/todos.ts` | Modify | Add `category` arg to `create`; add `category` to `getUnevaluatedTodos` return |
| `convex/http.ts` | Modify | Update `/agent/v1/todos-unevaluated` to include `category` in response items |
| `app/page.tsx` | Modify | Add profile modal (firstName/lastName edit) + level + displayName in header |
| `app/family/page.tsx` | Modify | Show `Lv.N` badge next to each user's name in tab and card |
| `app/todos/recurring/page.tsx` | Modify | Add category selector to create form |
| `components/TodoList.tsx` | Modify | Add category selector to create form |
| `lifelup-agent/star-evaluator.mjs` | Modify | Upgrade prompt with category rubric, pass category to LLM |

**No new Convex modules → no `api.d.ts` changes needed.**

---

## Category Reference

```typescript
// Use this union type everywhere (schema, UI, agent)
type TodoCategory =
  | "household"    // Tâches ménagères       — base 1–3 stars
  | "family_help"  // Aide à la famille      — base 2–4 stars
  | "training"     // Entraînement / sport   — base 2–5 stars
  | "school_work"  // École / travail        — base 2–5 stars
  | "leisure"      // Loisirs                — base 1–2 stars
  | "other"        // Autre                  — base 1–3 stars
```

French labels for UI:
```typescript
const CATEGORY_LABELS = {
  household:   "Tâches ménagères",
  family_help: "Aide famille",
  training:    "Entraînement",
  school_work: "École / travail",
  leisure:     "Loisirs",
  other:       "Autre",
};
```

---

## Level Formula

```typescript
function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt((totalStars ?? 0) / 5)) + 1;
}
```

Milestones: Lv.1=0⭐ · Lv.2=5⭐ · Lv.3=20⭐ · Lv.4=45⭐ · Lv.5=80⭐ · Lv.10=405⭐

---

## Display Name Helper

```typescript
function displayName(user: { firstName?: string; lastName?: string; email?: string }): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  return user.email?.split("@")[0] ?? "?";
}
```

---

## Tasks

### Task 1 — Update Convex Schema
**File:** `convex/schema.ts`
**depends-on:** none

Add to `users` table:
```typescript
firstName: v.optional(v.string()),
lastName: v.optional(v.string()),
```

Add to `todos` table:
```typescript
category: v.optional(v.union(
  v.literal("household"),
  v.literal("family_help"),
  v.literal("training"),
  v.literal("school_work"),
  v.literal("leisure"),
  v.literal("other"),
)),
```

No new indexes needed.

---

### Task 2 — Add `updateProfile` to `convex/users.ts`
**File:** `convex/users.ts`
**depends-on:** Task 1

Add a public mutation after the existing `getMe` query:

```typescript
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ... existing getMe ...

export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, { firstName, lastName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.patch(userId, { firstName, lastName });
  },
});
```

---

### Task 3 — Update `convex/todos.ts`
**File:** `convex/todos.ts`
**depends-on:** Task 1

**3a — Add `category` arg to `create`:**
```typescript
export const create = mutation({
  args: {
    text: v.string(),
    isRecurring: v.optional(v.boolean()),
    frequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"))),
    scheduledTime: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("household"),
      v.literal("family_help"),
      v.literal("training"),
      v.literal("school_work"),
      v.literal("leisure"),
      v.literal("other"),
    )),
  },
  handler: async (ctx, { text, isRecurring, frequency, scheduledTime, category }) => {
    // ... existing nextDueAt logic ...
    await ctx.db.insert("todos", {
      userId,
      text,
      completed: false,
      isRecurring: isRecurring ?? undefined,
      frequency: frequency ?? undefined,
      scheduledTime: scheduledTime ?? undefined,
      nextDueAt,
      category: category ?? undefined,
    });
  },
});
```

**3b — Update `getUnevaluatedTodos` to return `category`:**
The existing `internalQuery` already returns full todo documents, so `category` will be included automatically once it's in the schema. No code change needed in `getUnevaluatedTodos` itself — but verify the HTTP endpoint in Task 4 passes it through.

---

### Task 4 — Update `/agent/v1/todos-unevaluated` in `convex/http.ts`
**File:** `convex/http.ts`
**depends-on:** Task 3

Find the handler for `GET /agent/v1/todos-unevaluated`. It currently maps items to `{ type, id, text }`. Update the mapping to also include `category`:

**Current pattern (approximate):**
```typescript
const todos = await ctx.runQuery(internal.todos.getUnevaluatedTodos);
const items = todos.map((t) => ({ type: "todo", id: t._id, text: t.text }));
```

**Updated pattern:**
```typescript
const todos = await ctx.runQuery(internal.todos.getUnevaluatedTodos);
const items = todos.map((t) => ({
  type: "todo",
  id: t._id,
  text: t.text,
  category: t.category ?? "other",
}));
```

Do the same for the `recurringTodos` items in that same endpoint — add `category: t.category ?? "other"`.

---

### Task 5 — Profile Modal + Level Display in `app/page.tsx`
**File:** `app/page.tsx`
**depends-on:** Tasks 1, 2

**5a — Add level helper (at top of file, outside component):**
```typescript
function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt((totalStars ?? 0) / 5)) + 1;
}

function displayName(user: { firstName?: string; lastName?: string; email?: string }): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  return user.email?.split("@")[0] ?? "?";
}
```

**5b — Add profile modal state:**
```typescript
const [showProfile, setShowProfile] = useState(false);
const [firstName, setFirstName] = useState("");
const [lastName, setLastName] = useState("");
const [savingProfile, setSavingProfile] = useState(false);
const updateProfile = useMutation(api.users.updateProfile);
```

Populate state when `me` loads:
```typescript
useEffect(() => {
  if (me) {
    setFirstName(me.firstName ?? "");
    setLastName(me.lastName ?? "");
  }
}, [me]);
```

**5c — Update header right section:**

Replace:
```tsx
{me?.totalStars != null && (
  <span className="text-sm font-medium text-yellow-500">⭐{me.totalStars}</span>
)}
```

With:
```tsx
{me && (
  <button
    onClick={() => setShowProfile(true)}
    className="flex items-center gap-1.5 text-sm font-medium text-yellow-500 hover:text-yellow-600 transition-colors"
  >
    <span className="text-xs text-gray-400 dark:text-gray-500">Lv.{computeLevel(me.totalStars ?? 0)}</span>
    <span>⭐{me.totalStars ?? 0}</span>
  </button>
)}
```

**5d — Profile modal (add before closing `</main>`):**
```tsx
{showProfile && me && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    onClick={() => setShowProfile(false)}
  >
    <div
      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 w-full max-w-sm shadow-xl space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">Mon profil</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Prénom</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Prénom"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nom</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Nom de famille"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500 pt-1">
          Niveau : Lv.{computeLevel(me.totalStars ?? 0)} · ⭐{me.totalStars ?? 0} étoiles
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={async () => {
            setSavingProfile(true);
            try {
              await updateProfile({
                firstName: firstName.trim() || undefined,
                lastName: lastName.trim() || undefined,
              });
              setShowProfile(false);
            } finally {
              setSavingProfile(false);
            }
          }}
          disabled={savingProfile}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {savingProfile ? "Sauvegarde…" : "Enregistrer"}
        </button>
        <button
          onClick={() => setShowProfile(false)}
          className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  </div>
)}
```

Also update the greeting `👋 {me.email}` to use displayName:
```tsx
<p className="text-sm text-gray-500 dark:text-gray-400">
  👋 {displayName(me)}
</p>
```

Add `useMutation` to the import from `convex/react`.

---

### Task 6 — Level Badge in `app/family/page.tsx`
**File:** `app/family/page.tsx`
**depends-on:** Task 1

Add `computeLevel` helper at the top of the file (same function as Task 5):
```typescript
function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt((totalStars ?? 0) / 5)) + 1;
}
```

The `listAll` query already returns full user objects joined to todos. The `byUser` grouping doesn't include `totalStars`. Fix: the `todo.user` object already has `totalStars` since it's the full user document.

In the tab button, update to show level:
```tsx
// Current:
<span>{email.split("@")[0]}</span>
<span className="text-xs text-gray-400">{done}/{userTodos.length}</span>

// Updated — add level badge:
<span className="max-w-[80px] sm:max-w-none truncate">{email.split("@")[0]}</span>
<span className="text-xs text-gray-400">{done}/{userTodos.length}</span>
```

In the selected user card header, add level below the email:
```tsx
// Add after the email line:
{selectedUser.todos[0]?.user?.totalStars != null && (
  <p className="text-xs text-yellow-500">
    Lv.{computeLevel(selectedUser.todos[0].user.totalStars)} · ⭐{selectedUser.todos[0].user.totalStars}
  </p>
)}
```

Note: `selectedUser.todos[0]?.user` is available because `listAll` joins user data to each todo. Use it to get totalStars.

---

### Task 7 — Category Selector in `components/TodoList.tsx`
**File:** `components/TodoList.tsx`
**depends-on:** Tasks 1, 3

**7a — Add category constants at top of file:**
```typescript
type TodoCategory = "household" | "family_help" | "training" | "school_work" | "leisure" | "other";

const CATEGORY_LABELS: Record<TodoCategory, string> = {
  household:   "Tâches ménagères",
  family_help: "Aide famille",
  training:    "Entraînement",
  school_work: "École / travail",
  leisure:     "Loisirs",
  other:       "Autre",
};

const CATEGORY_ORDER: TodoCategory[] = [
  "household", "family_help", "training", "school_work", "leisure", "other",
];
```

**7b — Add category state:**
```typescript
const [category, setCategory] = useState<TodoCategory>("other");
```

**7c — Pass category to create:**
```typescript
await create({
  text: trimmed,
  isRecurring: isRecurring || undefined,
  frequency: isRecurring ? frequency : undefined,
  scheduledTime: isRecurring ? scheduledTime : undefined,
  category,
});
// Reset after submit:
setCategory("other");
```

**7d — Add category select in the form (after the recurring toggle row):**
```tsx
<div className="flex items-center gap-2 px-1">
  <label className="text-xs text-gray-400 flex-shrink-0">Catégorie</label>
  <select
    value={category}
    onChange={(e) => setCategory(e.target.value as TodoCategory)}
    className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1"
  >
    {CATEGORY_ORDER.map((c) => (
      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
    ))}
  </select>
</div>
```

**7e — Show category badge on todo items (optional, small badge):**
In the todo list item, after the star value badge, add:
```tsx
{todo.category && todo.category !== "other" && (
  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
    {CATEGORY_LABELS[todo.category as TodoCategory]}
  </span>
)}
```

---

### Task 8 — Category Selector in `app/todos/recurring/page.tsx`
**File:** `app/todos/recurring/page.tsx`
**depends-on:** Tasks 1, 3

Same pattern as Task 7. Add:
- `CATEGORY_LABELS`, `CATEGORY_ORDER`, `TodoCategory` type (or import from a shared location — but since CLAUDE.md says no shared utils unless needed, duplicate is fine)
- `category` state defaulting to `"other"`
- Pass `category` to `create({ ..., category })`
- A category select inside the form, below the frequency/time row

---

### Task 9 — Upgrade `lifelup-agent/star-evaluator.mjs`
**File:** `/home/claude/dev/lifelup-agent/star-evaluator.mjs`
**depends-on:** Task 4

Update `rateBatch` to receive items with `category` and use a category-aware rubric.

**Updated `rateBatch` function:**
```javascript
async function rateBatch(items) {
  const CATEGORY_RUBRIC = `
Catégorie et plage de points :
- household (tâches ménagères) : 1–3 étoiles (nettoyage, cuisine, rangement)
- family_help (aide famille) : 2–4 étoiles (aider un membre, garde, soutien)
- training (entraînement/sport) : 2–5 étoiles (sport, exercice, performance)
- school_work (école/travail) : 2–5 étoiles (devoirs, révisions, travail pro)
- leisure (loisirs) : 1–2 étoiles (détente, peu d'effort requis)
- other (autre) : 1–3 étoiles (divers)

Critères d'ajustement dans la plage :
- Durée courte (<15 min) → bas de la plage
- Durée moyenne (15–60 min) → milieu de la plage
- Durée longue (>1h) ou effort cognitif élevé → haut de la plage`;

  const listText = items
    .map((item, i) => `${i + 1}. [${item.category ?? "other"}] "${item.text}"`)
    .join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Évalue chaque tâche avec un nombre d'étoiles (1–5) selon sa catégorie et l'effort requis.

${CATEGORY_RUBRIC}

Tâches à évaluer :
${listText}

Réponds UNIQUEMENT avec un tableau JSON : [{"index":1,"starValue":2},{"index":2,"starValue":4}]`,
        },
      ],
    }),
  });

  // ... rest of parsing logic unchanged ...
}
```

Note: The file is at `/home/claude/dev/lifelup-agent/star-evaluator.mjs` (not inside the lifelUp repo). Edit it there directly.

---

### Task 10 — Build & Lint Validation
**depends-on:** Tasks 1–9

```bash
cd /home/claude/dev/lifelUp
npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

Both must pass with zero errors.

---

### Task 11 — Convex Deploy
**depends-on:** Task 10

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

Expected: schema updated with `firstName`, `lastName` on users and `category` on todos.

---

### Task 12 — Production Deploy
**depends-on:** Task 11

```bash
# Star evaluator agent (edit in place — no PM2 restart needed for mjs content change,
# but DO restart to pick up the new code):
pm2 delete lifelup-star-evaluator
pm2 start /home/claude/dev/lifelup-agent/ecosystem.config.cjs --only lifelup-star-evaluator
pm2 save

# Next.js app
cd /var/www/lifelup && git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup
```

---

## Validation Sequence

### 1. TypeScript & Lint
```bash
npm run build   # zero errors
npm run lint    # zero warnings
```

### 2. Convex Deploy
```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
# Should show: added fields firstName/lastName to users, category to todos
```

### 3. Verify todos-unevaluated returns category
```bash
curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/todos-unevaluated
# Expected: JSON array with items having { type, id, text, category } fields
```

### 4. Manual Browser Checks
- Open `https://lifelup.aidigitalassistant.cloud`
- Header should show `Lv.1 ⭐0` (or existing total) — click it → profile modal opens
- Set a first and last name → save → header updates with the name
- Create a todo → category dropdown visible → select "Entraînement" → add
- Wait ≤5min → star evaluator assigns 2–5 stars to the training todo
- Navigate to `/family` → each user tab shows level badge

---

## Known Risks

1. **No api.d.ts change needed** — we're only modifying existing modules (`users.ts`, `todos.ts`), not adding new ones. The build will pick up new functions automatically.

2. **`npx convex deploy` required** — schema changes to `users` and `todos` won't be live until deployed. Build passes before deploy because TypeScript reads the local schema.ts.

3. **Family page `totalStars` access** — `listAll` returns todos with `user` joined. The `user.totalStars` field will be available after deploy. If no todos exist for a user, their level can't be shown via this path — that's acceptable for MVP.

4. **Star evaluator agent is outside the lifelUp repo** — it lives at `/home/claude/dev/lifelup-agent/star-evaluator.mjs`. Edit it there, then restart the PM2 process. Do NOT commit agent scripts to the main repo.

5. **Existing todos have no category** — they'll default to `"other"` in the UI (since category is optional). The star evaluator will evaluate them with `category: "other"` which gives the neutral 1–3 range. No migration needed.

6. **`useMutation` import in `app/page.tsx`** — currently only `useConvexAuth` and `useQuery` are imported. Add `useMutation` to the import.

7. **Category type duplication** — `TodoCategory` type and `CATEGORY_LABELS` constants are duplicated in `TodoList.tsx` and `app/todos/recurring/page.tsx`. This is intentional (CLAUDE.md: no premature abstraction for two uses).

---

## Confidence Score: 8/10

All patterns are direct extensions of existing code. The modal pattern copies `context/page.tsx` exactly. The schema additions are minimal. The star evaluator upgrade is a prompt change + one extra field in the API response. Minor uncertainty: Task 6 (family page level display) depends on how `totalStars` is accessible via the `listAll` join — may need a minor adjustment depending on the exact shape of `todo.user`.

Ready to implement: `/execute-prp PRPs/profiles-levels-categories.md`

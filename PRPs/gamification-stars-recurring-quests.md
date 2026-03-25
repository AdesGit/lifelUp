# PRP: Gamification — Stars, Recurring Todos & Quests

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: INITIAL.md — gamification feature request
> Template: PRPs/templates/prp_lifelup.md

---

## Overview

Add a gamification layer to LifeLup: users earn stars by completing tasks (values assigned automatically by an AI evaluator), recurring todos respawn daily/weekly from templates, and a weekly quest agent groups recurring tasks into bonus-point challenges. The family page gains per-user tabs.

---

## Success Criteria

- [ ] Family page shows one tab per user; clicking shows only that user's todos
- [ ] Each todo displays its star value (⭐1–5) once evaluated; unrated shows a dim placeholder
- [ ] Completing a todo adds its star value to the user's running total shown in the nav
- [ ] `/todos/recurring` page: create/delete recurring todo templates (daily or weekly)
- [ ] Recurring todos auto-spawn once per day (daily) or once per week (weekly)
- [ ] `/quests` page shows current week's quests with per-quest progress bar and bonus stars
- [ ] Completing all recurring todos in a quest automatically awards bonus stars
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] Unauthenticated users redirected to `/signin` on all new pages
- [ ] Bearer token 401 on all 6 new `/agent/v1/*` endpoints
- [ ] Star evaluator assigns values to new todos within ~5 minutes

---

## Context Files to Read Before Implementing

- `convex/schema.ts` — current tables (todos, users, goals shape)
- `convex/_generated/api.d.ts` — api.d.ts import pattern
- `convex/todos.ts` — toggle + create mutations to extend
- `convex/goals.ts` — internalQuery/internalMutation + upsert-by-fingerprint pattern
- `convex/http.ts` — verifyAgentSecret + existing endpoint structure
- `app/family/page.tsx` — current family page (listAll + byUser grouping to replace with tabs)
- `components/TodoList.tsx` — todo card to add star badge to
- `app/goals/page.tsx` — page skeleton + nav header to copy
- `examples/convex-mutation.ts` — CRUD + upsert pattern
- `examples/convex-http-agent.ts` — HTTP endpoint pattern
- `examples/app-page.tsx` — protected page skeleton
- `examples/agent-script.mjs` — PM2 polling agent pattern
- `lifelup-agent/ecosystem.config.cjs` — PM2 config to extend

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/schema.ts` | Modify | +3 tables, modify todos + users |
| `convex/_generated/api.d.ts` | Modify | Add recurringTodos + quests imports |
| `convex/recurringTodos.ts` | **Create** | CRUD + internal spawn functions |
| `convex/quests.ts` | **Create** | List + internal quest generation helpers |
| `convex/todos.ts` | Modify | Extend toggle (stars + quest detection) + internal evaluator functions |
| `convex/http.ts` | Modify | 6 new endpoints |
| `components/TodoList.tsx` | Modify | Add ⭐ badge per todo + total stars in header |
| `app/family/page.tsx` | Modify | Replace card loop with user tabs |
| `app/todos/recurring/page.tsx` | **Create** | Recurring template management |
| `app/quests/page.tsx` | **Create** | Quest progress page |
| `app/page.tsx` | Modify | Add nav links (Recurring, Quests) |
| `app/family/page.tsx` | Modify | Add nav links + tabs |
| `app/coach/page.tsx` | Modify | Add nav links |
| `app/goals/page.tsx` | Modify | Add nav links |
| `app/context/page.tsx` | Modify | Add nav links |
| `lifelup-agent/star-evaluator.mjs` | **Create** | Star value polling agent |
| `lifelup-agent/ecosystem.config.cjs` | Modify | Add star-evaluator process |

---

## Tasks

### Task 1 — Schema
**File:** `convex/schema.ts`
**Action:** Modify
**Depends on:** nothing

```typescript
// Modify todos table — add 2 optional fields:
todos: defineTable({
  userId: v.id("users"),
  text: v.string(),
  completed: v.boolean(),
  starValue: v.optional(v.number()),                   // 1–5, set by evaluator agent
  recurrenceId: v.optional(v.id("recurringTodos")),    // links to template if spawned
})
  .index("by_user", ["userId"]),
  // Note: do NOT add index on starValue — Convex optional field indexes are unreliable for null detection
  // Use .collect() + filter instead in getUnevaluatedTodos

// Modify users table — add totalStars:
users: defineTable({
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  image: v.optional(v.string()),
  isAnonymous: v.optional(v.boolean()),
  totalStars: v.optional(v.number()),       // running total, treated as 0 when absent
})
  .index("email", ["email"]),

// New: recurringTodos table
recurringTodos: defineTable({
  userId: v.id("users"),
  text: v.string(),
  frequency: v.union(v.literal("daily"), v.literal("weekly")),
  starValue: v.optional(v.number()),
  lastSpawnedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_frequency", ["frequency"]),

// New: quests table
quests: defineTable({
  title: v.string(),
  description: v.string(),
  bonusStars: v.number(),
  weekStart: v.number(),              // Monday 00:00 UTC timestamp
  status: v.union(v.literal("active"), v.literal("completed"), v.literal("expired")),
  fingerprint: v.string(),            // "week-YYYY-WW:slug"
})
  .index("by_status", ["status"])
  .index("by_fingerprint", ["fingerprint"]),

// New: questTodos — one row per (quest × user × recurring template)
questTodos: defineTable({
  questId: v.id("quests"),
  userId: v.id("users"),
  recurringTodoId: v.id("recurringTodos"),
  completed: v.boolean(),
  completedAt: v.optional(v.number()),
})
  .index("by_quest", ["questId"])
  .index("by_user", ["userId"])
  .index("by_recurring_todo", ["recurringTodoId"]),
```

---

### Task 2 — Update api.d.ts
**File:** `convex/_generated/api.d.ts`
**Action:** Modify
**Depends on:** Task 1
**⚠️ Must be done BEFORE Task 13 (npm run build)**

```typescript
// Add these two imports with the others at the top:
import type * as recurringTodos from "../recurringTodos.js";
import type * as quests from "../quests.js";

// Add to fullApi ApiFromModules<{...}>:
recurringTodos: typeof recurringTodos;
quests: typeof quests;
```

---

### Task 3 — Create `convex/recurringTodos.ts`
**File:** `convex/recurringTodos.ts`
**Action:** Create
**Depends on:** Task 1, Task 2

```typescript
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Public (web app) ────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db.query("recurringTodos").withIndex("by_user", q => q.eq("userId", userId)).collect();
  },
});

export const create = mutation({
  args: {
    text: v.string(),
    frequency: v.union(v.literal("daily"), v.literal("weekly")),
  },
  handler: async (ctx, { text, frequency }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("recurringTodos", { userId, text, frequency });
  },
});

export const remove = mutation({
  args: { id: v.id("recurringTodos") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const template = await ctx.db.get(id);
    if (!template || template.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// ─── Internal (agents) ───────────────────────────────────────────────────────

// Templates due for spawning (daily if 24h elapsed, weekly if 7d elapsed)
export const getTemplatesNeedingSpawn = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const DAY = 86_400_000;
    const WEEK = 7 * DAY;
    const all = await ctx.db.query("recurringTodos").collect();
    return all.filter(t => {
      if (!t.lastSpawnedAt) return true;
      const elapsed = now - t.lastSpawnedAt;
      return t.frequency === "daily" ? elapsed >= DAY : elapsed >= WEEK;
    });
  },
});

// Create a todo instance from a template, update lastSpawnedAt
export const spawnTodo = internalMutation({
  args: { templateId: v.id("recurringTodos") },
  handler: async (ctx, { templateId }) => {
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    await ctx.db.insert("todos", {
      userId: template.userId,
      text: template.text,
      completed: false,
      starValue: template.starValue,     // inherit star value from template
      recurrenceId: templateId,
    });
    await ctx.db.patch(templateId, { lastSpawnedAt: Date.now() });
  },
});

// All recurring templates for a user (for quest generation)
export const getTemplatesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.query("recurringTodos").withIndex("by_user", q => q.eq("userId", userId)).collect();
  },
});

// Templates without starValue (for evaluator)
export const getUnevaluatedTemplates = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("recurringTodos").collect();
    return all.filter(t => t.starValue == null).map(t => ({ id: t._id, text: t.text, type: "recurring" as const }));
  },
});

export const setStarValue = internalMutation({
  args: { id: v.id("recurringTodos"), starValue: v.number() },
  handler: async (ctx, { id, starValue }) => ctx.db.patch(id, { starValue }),
});
```

---

### Task 4 — Create `convex/quests.ts`
**File:** `convex/quests.ts`
**Action:** Create
**Depends on:** Task 1, Task 2

```typescript
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Public (web app) ────────────────────────────────────────────────────────

// Returns current week's active quests + this user's questTodo progress
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    // Monday of this week at 00:00 UTC
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    d.setUTCHours(0, 0, 0, 0);
    const weekStart = d.getTime();

    const quests = await ctx.db.query("quests")
      .withIndex("by_status", q => q.eq("status", "active"))
      .filter(q => q.gte(q.field("weekStart"), weekStart))
      .collect();

    return Promise.all(quests.map(async (quest) => {
      const tasks = await ctx.db.query("questTodos")
        .withIndex("by_quest", q => q.eq("questId", quest._id))
        .filter(q => q.eq(q.field("userId"), userId))
        .collect();
      return { ...quest, tasks };
    }));
  },
});

// ─── Internal (agents) ───────────────────────────────────────────────────────

// All users who have at least one recurringTodo (for quest generator)
export const getUsersWithRecurring = internalQuery({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("recurringTodos").collect();
    const seenIds = new Set<string>();
    for (const t of templates) seenIds.add(t.userId);
    const allUsers = await ctx.db.query("users").collect();
    const usersWithTemplates = allUsers.filter(u => seenIds.has(u._id));
    return Promise.all(usersWithTemplates.map(async (user) => ({
      userId: user._id,
      userEmail: user.email ?? "unknown",
      recurringTodos: templates.filter(t => t.userId === user._id),
    })));
  },
});

// Upsert quest + questTodo assignments (fingerprint dedup)
export const upsertQuest = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    bonusStars: v.number(),
    weekStart: v.number(),
    fingerprint: v.string(),
    todoAssignments: v.array(v.object({
      userId: v.id("users"),
      recurringTodoId: v.id("recurringTodos"),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("quests")
      .withIndex("by_fingerprint", q => q.eq("fingerprint", args.fingerprint))
      .first();

    let questId: string;
    if (existing) {
      questId = existing._id;
      await ctx.db.patch(existing._id, {
        title: args.title, description: args.description, bonusStars: args.bonusStars,
      });
    } else {
      questId = await ctx.db.insert("quests", {
        title: args.title, description: args.description,
        bonusStars: args.bonusStars, weekStart: args.weekStart,
        status: "active", fingerprint: args.fingerprint,
      });
    }

    for (const assignment of args.todoAssignments) {
      const exists = await ctx.db.query("questTodos")
        .withIndex("by_quest", q => q.eq("questId", questId as any))
        .filter(q => q.and(
          q.eq(q.field("userId"), assignment.userId),
          q.eq(q.field("recurringTodoId"), assignment.recurringTodoId),
        ))
        .first();
      if (!exists) {
        await ctx.db.insert("questTodos", { questId: questId as any, ...assignment, completed: false });
      }
    }
  },
});

// Called from todos.toggle when a recurring todo instance is completed
export const checkQuestCompletion = internalMutation({
  args: { recurringTodoId: v.id("recurringTodos"), userId: v.id("users") },
  handler: async (ctx, { recurringTodoId, userId }) => {
    const openItems = await ctx.db.query("questTodos")
      .withIndex("by_recurring_todo", q => q.eq("recurringTodoId", recurringTodoId))
      .filter(q => q.and(q.eq(q.field("userId"), userId), q.eq(q.field("completed"), false)))
      .collect();

    for (const item of openItems) {
      await ctx.db.patch(item._id, { completed: true, completedAt: Date.now() });

      // Check if all this user's questTodos for this quest are done
      const allItems = await ctx.db.query("questTodos")
        .withIndex("by_quest", q => q.eq("questId", item.questId))
        .filter(q => q.eq(q.field("userId"), userId))
        .collect();

      if (allItems.length > 0 && allItems.every(i => i.completed || i._id === item._id)) {
        const quest = await ctx.db.get(item.questId);
        if (quest?.status === "active") {
          await ctx.db.patch(item.questId, { status: "completed" });
          const user = await ctx.db.get(userId);
          await ctx.db.patch(userId, { totalStars: (user?.totalStars ?? 0) + quest.bonusStars });
        }
      }
    }
  },
});
```

---

### Task 5 — Modify `convex/todos.ts`
**File:** `convex/todos.ts`
**Action:** Modify
**Depends on:** Task 3, Task 4

Add import for `internal` at top:
```typescript
import { internal } from "./_generated/api";
```

Replace the `toggle` mutation:
```typescript
export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found");
    const nowCompleted = !todo.completed;
    await ctx.db.patch(id, { completed: nowCompleted });

    if (nowCompleted) {
      if (todo.starValue) {
        const user = await ctx.db.get(userId);
        await ctx.db.patch(userId, { totalStars: (user?.totalStars ?? 0) + todo.starValue });
      }
      if (todo.recurrenceId) {
        await ctx.runMutation(internal.quests.checkQuestCompletion, {
          recurringTodoId: todo.recurrenceId,
          userId,
        });
      }
    }
  },
});
```

Add these two internal functions at the bottom:
```typescript
// Todos without starValue yet (for evaluator agent)
export const getUnevaluatedTodos = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("todos").collect();
    return all
      .filter(t => t.starValue == null)
      .map(t => ({ id: t._id, text: t.text, type: "todo" as const }));
  },
});

export const setTodoStarValue = internalMutation({
  args: { id: v.id("todos"), starValue: v.number() },
  handler: async (ctx, { id, starValue }) => ctx.db.patch(id, { starValue }),
});
```

---

### Task 6 — Modify `convex/http.ts`
**File:** `convex/http.ts`
**Action:** Modify — add 6 new endpoints after the existing ones
**Depends on:** Task 3, Task 4, Task 5

```typescript
// GET /agent/v1/recurring-work — templates due for spawning
http.route({
  path: "/agent/v1/recurring-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const templates = await ctx.runQuery(internal.recurringTodos.getTemplatesNeedingSpawn);
    return Response.json(templates);
  }),
});

// POST /agent/v1/recurring-spawn — spawn a todo from a template
http.route({
  path: "/agent/v1/recurring-spawn",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { templateId } = await req.json();
    await ctx.runMutation(internal.recurringTodos.spawnTodo, { templateId });
    return Response.json({ ok: true });
  }),
});

// GET /agent/v1/todos-unevaluated — todos + recurring templates without starValue
http.route({
  path: "/agent/v1/todos-unevaluated",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const [todos, templates] = await Promise.all([
      ctx.runQuery(internal.todos.getUnevaluatedTodos),
      ctx.runQuery(internal.recurringTodos.getUnevaluatedTemplates),
    ]);
    return Response.json([...todos, ...templates]);
  }),
});

// POST /agent/v1/todos-star — save star values for todos and/or recurring templates
http.route({
  path: "/agent/v1/todos-star",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { ratings } = await req.json(); // [{id, type: "todo"|"recurring", starValue}]
    for (const r of ratings) {
      if (r.type === "todo") {
        await ctx.runMutation(internal.todos.setTodoStarValue, { id: r.id, starValue: r.starValue });
      } else {
        await ctx.runMutation(internal.recurringTodos.setStarValue, { id: r.id, starValue: r.starValue });
      }
    }
    return Response.json({ ok: true, saved: ratings.length });
  }),
});

// GET /agent/v1/quests-work — users + their recurring todos (for quest generator)
http.route({
  path: "/agent/v1/quests-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const data = await ctx.runQuery(internal.quests.getUsersWithRecurring);
    return Response.json(data);
  }),
});

// POST /agent/v1/quests-save — upsert generated quests
http.route({
  path: "/agent/v1/quests-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { quests } = await req.json();
    for (const quest of quests) {
      await ctx.runMutation(internal.quests.upsertQuest, quest);
    }
    return Response.json({ ok: true, saved: quests.length });
  }),
});
```

---

### Task 7 — Modify `components/TodoList.tsx`
**File:** `components/TodoList.tsx`
**Action:** Modify — add star badge to each todo + total stars display
**Depends on:** nothing

- Add `useQuery(api.users.getMe)` to get `totalStars`
- Pass `totalStars` up or display inline in the component header
- On each todo row: after the text, add `{todo.starValue ? <span>⭐{todo.starValue}</span> : <span className="text-gray-300">·</span>}`
- Show `⭐ {totalStars ?? 0}` somewhere in the todo list header area

---

### Task 8 — Modify `app/family/page.tsx`
**File:** `app/family/page.tsx`
**Action:** Modify — add user tabs
**Depends on:** nothing (uses existing `listAll` query, no backend changes)

```typescript
// Add useState for selected user
const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

// Derive unique users from todos data
const users = Object.values(byUser); // existing byUser grouping
// Auto-select first user
useEffect(() => {
  if (!selectedUserId && users.length > 0) setSelectedUserId(users[0].userId);
}, [users, selectedUserId]);

// Tab bar (horizontal scroll for many users)
<div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
  {users.map(u => (
    <button key={u.userId}
      onClick={() => setSelectedUserId(u.userId)}
      className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
        selectedUserId === u.userId
          ? "border-blue-600 text-blue-600 dark:text-blue-400"
          : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
      }`}
    >
      {u.email} · {u.done}/{u.total}
    </button>
  ))}
</div>

// Content: only selected user's todos
{selectedUser && (
  <div className="space-y-2">
    {selectedUser.todos.map(todo => (
      <div key={todo._id} className="...">
        {todo.completed ? "✓" : "○"} {todo.text}
        {todo.starValue && <span className="ml-2 text-xs">⭐{todo.starValue}</span>}
      </div>
    ))}
  </div>
)}
```

---

### Task 9 — Update nav in all existing pages
**Files:** `app/page.tsx`, `app/family/page.tsx`, `app/coach/page.tsx`, `app/goals/page.tsx`, `app/context/page.tsx`
**Action:** Modify — add "Recurring" and "Quests" links to each page's nav
**Depends on:** nothing

In each file, find the nav section and add after "Context":
```tsx
<span className="text-gray-300 dark:text-gray-600">·</span>
<Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
  Recurring
</Link>
<span className="text-gray-300 dark:text-gray-600">·</span>
<Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
  Quests
</Link>
```

---

### Task 10 — Create `app/todos/recurring/page.tsx`
**File:** `app/todos/recurring/page.tsx`
**Action:** Create
**Depends on:** Task 3, Task 9

Protected page. Key parts:
```typescript
const templates = useQuery(api.recurringTodos.list);
const createTemplate = useMutation(api.recurringTodos.create);
const removeTemplate = useMutation(api.recurringTodos.remove);

// State for inline new-template form
const [newText, setNewText] = useState("");
const [newFreq, setNewFreq] = useState<"daily" | "weekly">("daily");
const [adding, setAdding] = useState(false);

// Render: nav (Recurring active) + inline form + list
// Each row: text | badge (Daily/Weekly) | ⭐value or "pending" | delete button
```

---

### Task 11 — Create `app/quests/page.tsx`
**File:** `app/quests/page.tsx`
**Action:** Create
**Depends on:** Task 4, Task 9

Protected page:
```typescript
const quests = useQuery(api.quests.list);
const me = useQuery(api.users.getMe);

// Render: nav (Quests active) + "⭐ {me?.totalStars ?? 0} total" badge in header
// Quest card for each quest:
//   title + description
//   progress: tasks.filter(t=>t.completed).length / tasks.length
//   "Bonus: ⭐{bonusStars}"
//   if status === "completed": green checkmark + "Bonus earned!"
// Empty state: "No quests this week yet — generated every Monday"
```

---

### Task 12 — Create `lifelup-agent/star-evaluator.mjs`
**File:** `/home/claude/dev/lifelup-agent/star-evaluator.mjs`
**Action:** Create
**Depends on:** Task 6

```javascript
const CONVEX_URL = "https://convex.aidigitalassistant.cloud";
const AGENT_SECRET = "de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 20;

// GET /agent/v1/todos-unevaluated → [{id, text, type}]
// Batch into groups of BATCH_SIZE
// For each batch: call Claude Haiku with rating prompt
// Prompt: list of "ID: text" → return JSON [{id, starValue}]
// POST /agent/v1/todos-star → {ratings: [{id, type, starValue}]}
// Per-batch error isolation — don't let one bad batch kill the poll
```

---

### Task 13 — Modify `lifelup-agent/ecosystem.config.cjs`
**File:** `/home/claude/dev/lifelup-agent/ecosystem.config.cjs`
**Action:** Modify — add star-evaluator to apps array
**Depends on:** Task 12

```javascript
{
  name: "lifelup-star-evaluator",
  script: "/home/claude/dev/lifelup-agent/star-evaluator.mjs",
  interpreter: "node",
  env: {
    ANTHROPIC_API_KEY: "<same key as coach agent>",
  },
}
```

---

### Task 14 — Build + Lint Validation
**Action:** Run
**Depends on:** Tasks 1–13

```bash
cd /home/claude/dev/lifelUp
npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

Fix all errors before Task 15.

---

### Task 15 — Deploy
**Action:** Run
**Depends on:** Task 14

```bash
# Convex deploy (schema + functions)
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# Start star evaluator
cd /home/claude/dev/lifelup-agent
pm2 start ecosystem.config.cjs --only lifelup-star-evaluator
pm2 save

# Production app
cd /var/www/lifelup
git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup
```

---

### Task 16 — RemoteTriggers (manual setup)
**Action:** Configure at claude.ai/code/scheduled
**Depends on:** Task 15

**1. Daily recurring spawn** — `0 6 * * *`
```
Bearer: de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
Call GET https://convex.aidigitalassistant.cloud/agent/v1/recurring-work
For each template in the response, call POST https://convex.aidigitalassistant.cloud/agent/v1/recurring-spawn with body {"templateId": template._id}
Log how many todos were spawned.
```

**2. Weekly quest generation** — `0 7 * * 1` (Monday 7am UTC)
```
Bearer: de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
Call GET https://convex.aidigitalassistant.cloud/agent/v1/quests-work
For each user, design 1-2 quests challenging them to complete 3-4 of their recurring tasks this week.
Each quest: {title, description, bonusStars (10-30), weekStart (this Monday 00:00 UTC), fingerprint ("week-YYYY-WW:slug"), todoAssignments: [{userId, recurringTodoId}]}
POST to https://convex.aidigitalassistant.cloud/agent/v1/quests-save with body {"quests": [...]}
```

---

## Validation Sequence

```bash
# 1. Build
npm run build 2>&1 | tail -10

# 2. Lint
npm run lint 2>&1 | tail -5

# 3. Convex deploy
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy

# 4. Auth check on all 6 new endpoints
for ep in recurring-work recurring-spawn todos-unevaluated todos-star quests-work quests-save; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer wrongtoken" \
    https://convex.aidigitalassistant.cloud/agent/v1/$ep)
  echo "$ep → $code (expected 401)"
done

# 5. Star evaluator health
pm2 logs lifelup-star-evaluator --lines 20 --nostream

# 6. Manual verification
# Visit /todos/recurring → create "Take vitamins" (daily) → appears in list
# Visit /family → see tabs per user, click switches content
# Visit /quests → see empty state
# Go to home, complete a todo with starValue → total stars increments in nav
# Check /todos/recurring star value updates within 5 min
```

---

## Known Risks

- **`toggle` mutation DB ops**: 3 sequential DB operations in one mutation. Valid in Convex — all run in the same transaction. `ctx.runMutation(internal.quests.checkQuestCompletion)` is a nested mutation call; verify Convex supports this (it does via `ctx.runMutation`).
- **Optional field index**: Do NOT index `starValue` on todos — Convex optional field indexes only include docs where the field exists (not missing). Use `.collect() + .filter(t => t.starValue == null)` instead.
- **api.d.ts: 2 modules**: Both `recurringTodos` and `quests` must be added. Missing either → build fails.
- **Nav in 5 files**: Must add Recurring + Quests links to `page.tsx`, `family/page.tsx`, `coach/page.tsx`, `goals/page.tsx`, `context/page.tsx`. Don't miss any.
- **Quest weekStart**: Must be Monday 00:00 UTC. Use: `const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay()+6)%7)); d.setUTCHours(0,0,0,0); weekStart = d.getTime()`
- **Star evaluator batching**: Max 20 per LLM call. Parse response as JSON carefully — haiku can return markdown-wrapped JSON.

---

## Confidence Score

**Score: 8/10**

High confidence: all patterns (agent HTTP endpoints, internalMutation, protected pages, PM2 agent) are proven in this codebase.

Slight uncertainty:
- `ctx.runMutation(internal.quests.checkQuestCompletion)` nested call — verify Convex supports nested `ctx.runMutation` (it does, but worth noting)
- Nav update across 5 files — mechanical but easy to miss one

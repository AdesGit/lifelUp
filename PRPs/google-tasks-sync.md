# PRP: Google Tasks Bilateral Sync

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: filled from `INITIAL.md` via `/generate-prp`
> See completed example: `PRPs/EXAMPLE_goals_agent.md`

---

## Overview

Extend the existing Google Calendar OAuth connection (table `googleCalendarTokens`) to also cover
the Google Tasks scope. A new PM2 agent (`tasks-sync.mjs`) syncs LifeLup todos bilaterally with
all of the user's Google Task lists every 15 minutes — last-write-wins, no separate token table.

---

## Success Criteria

- [ ] Re-authorizing Google OAuth adds the Tasks scope — `tasksScope` flag set to `true` on the token row
- [ ] Users who have not yet re-authorized see a "Reconnectez pour activer Google Tasks" prompt on `/integrations`
- [ ] All tasks from all of the user's Google Task lists appear as LifeLup todos (with `gtaskId` set)
- [ ] All LifeLup todos (with or without `dueAt`) push to the user's default Google Task list
- [ ] Completing a todo in LifeLup marks the corresponding Google Task as completed (status: "completed")
- [ ] Completing a Google Task marks the corresponding LifeLup todo as completed on next sync
- [ ] New tasks added in Google Tasks since last sync appear as new LifeLup todos
- [ ] Last-write-wins: most recently modified side wins (compare `lifelupUpdatedAt` vs `gtaskUpdatedAt`)
- [ ] `defaultTaskListId` stored on the token row after first sync to avoid repeated list fetches
- [ ] `lastTasksSyncAt` updated on the token row after each successful sync run
- [ ] Sync agent runs every 15 min via PM2 `cron_restart` (same cadence as GCal sync)
- [ ] `/integrations` page shows Google Tasks status card alongside Google Calendar card
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] Bearer token auth on all `/agent/v1/gtask-*` endpoints: wrong token → 401, correct token → valid JSON
- [ ] Manual verification: connect Google account with Tasks scope, create a todo in LifeLup, wait 15 min (or trigger manually), confirm task appears in Google Tasks

---

## Context Files to Read Before Implementing

- `convex/schema.ts` — current tables; `googleCalendarTokens` and `todos` are the only tables touched
- `convex/_generated/api.d.ts` — no new module needed (changes go into `googleCalendar.ts` and `todos.ts`); read to confirm import list is current
- `convex/googleCalendar.ts` — all existing token CRUD; new Tasks fields go here
- `convex/todos.ts` — existing `getTodosWithDueAt`, `patchGcalFields`, `createFromGcal`; new Tasks equivalents go here
- `convex/http.ts` — existing pattern; append new `/agent/v1/gtask-*` routes before `export default http`
- `lifelup-agent/calendar-sync.mjs` — canonical bilateral sync pattern to copy for `tasks-sync.mjs`
- `lifelup-agent/ecosystem.config.cjs` — add new `lifelup-tasks-sync` entry here
- `app/integrations/page.tsx` — existing integration card; add Google Tasks card in same style
- `examples/convex-http-agent.ts` — verifyAgentSecret + GET/POST pattern
- `examples/agent-script.mjs` — PM2 script pattern

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/schema.ts` | Modify | Add `gtaskId`, `gtaskListId`, `gtaskUpdatedAt`, `lifelupUpdatedAt` to `todos`; add `tasksScope`, `defaultTaskListId`, `lastTasksSyncAt` to `googleCalendarTokens` |
| `convex/_generated/api.d.ts` | No change | No new module — changes are in existing modules |
| `convex/googleCalendar.ts` | Modify | Add Tasks-aware internal mutations; update `saveToken` args to accept new fields |
| `convex/todos.ts` | Modify | Add `getAllTodosForUser` internalQuery + `patchGtaskFields` internalMutation + `createFromGtask` internalMutation + `setCompleted` internalMutation; update `create`/`toggle` mutations to set `lifelupUpdatedAt` |
| `convex/http.ts` | Modify | Append 6 new `/agent/v1/gtask-*` endpoints before `export default http` |
| `app/integrations/page.tsx` | Modify | Add Google Tasks status card; update `buildGoogleOAuthUrl` to include Tasks scope; show "reconnect" prompt if `tasksScope` false |
| `app/api/auth/google/callback/route.ts` | Modify | Pass `tasksScope: true` to `gcal-oauth-save` when Tasks scope is present in the token response |
| `lifelup-agent/tasks-sync.mjs` | Create | PM2 agent — bilateral Tasks sync, runs every 15 min |
| `lifelup-agent/ecosystem.config.cjs` | Modify | Add `lifelup-tasks-sync` entry with `cron_restart: "*/15 * * * *"` |

---

## Tasks

### Task 1: Schema — extend `todos` + `googleCalendarTokens`
**File:** `convex/schema.ts`
**Action:** Modify
**Depends on:** nothing

Add these optional fields to the `todos` table (after `gcalUpdatedAt`):
```typescript
gtaskId: v.optional(v.string()),          // Google Task ID
gtaskListId: v.optional(v.string()),      // which Google Task list it belongs to
gtaskUpdatedAt: v.optional(v.number()),   // last known GTask modification time (unix ms)
lifelupUpdatedAt: v.optional(v.number()), // last time this todo was edited in LifeLup (unix ms)
```

> Note: `lifelupUpdatedAt` is also needed by `calendar-sync.mjs` (already references it via `todo.lifelupUpdatedAt ?? 0`). Adding it here makes both sync agents consistent.

Add these optional fields to the `googleCalendarTokens` table:
```typescript
tasksScope: v.optional(v.boolean()),          // true after user re-authorized with Tasks scope
defaultTaskListId: v.optional(v.string()),    // cached ID of user's "My Tasks" list
lastTasksSyncAt: v.optional(v.number()),      // unix ms, updated after each Tasks sync run
```

---

### Task 2: Convex module — `convex/googleCalendar.ts` additions
**File:** `convex/googleCalendar.ts`
**Action:** Modify — add new internal mutations below existing ones
**Depends on:** Task 1

Add the following internal mutations (do NOT modify existing ones):

```typescript
// Called by gcal-oauth-save endpoint when Tasks scope is present
export const setTasksScope = internalMutation({
  args: { userId: v.id("users"), defaultTaskListId: v.optional(v.string()) },
  handler: async (ctx, { userId, defaultTaskListId }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (token) {
      await ctx.db.patch(token._id, {
        tasksScope: true,
        ...(defaultTaskListId ? { defaultTaskListId } : {}),
      });
    }
  },
});

// Called by tasks-sync.mjs to cache the default task list ID
export const updateDefaultTaskList = internalMutation({
  args: { userId: v.id("users"), defaultTaskListId: v.string() },
  handler: async (ctx, { userId, defaultTaskListId }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.patch(token._id, { defaultTaskListId });
  },
});

// Called by tasks-sync.mjs after each successful sync run
export const updateLastTasksSync = internalMutation({
  args: { userId: v.id("users"), lastTasksSyncAt: v.number() },
  handler: async (ctx, { userId, lastTasksSyncAt }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.patch(token._id, { lastTasksSyncAt });
  },
});

// Returns all users with tasksScope=true (for the Tasks sync agent)
export const getTasksTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("googleCalendarTokens")
      .filter((q) => q.eq(q.field("tasksScope"), true))
      .collect();
  },
});
```

---

### Task 3: Convex module — `convex/todos.ts` additions
**File:** `convex/todos.ts`
**Action:** Modify — append new internal functions at end of file; also update `create` and `toggle` mutations
**Depends on:** Task 1

**3a. Update `create` mutation** — add `lifelupUpdatedAt: Date.now()` in the `ctx.db.insert` call so new todos get a baseline timestamp:
```typescript
// In the handler, add to the insert object:
lifelupUpdatedAt: Date.now(),
```

**3b. Update `toggle` mutation** — set `lifelupUpdatedAt` when a todo is toggled (text + completed change both count):
```typescript
// In toggle handler, add to the patch:
lifelupUpdatedAt: Date.now(),
```

**3c. Add internal functions** (append after `createFromGcal`):
```typescript
// Returns ALL todos for a user (for Tasks sync — not filtered by dueAt)
export const getAllTodosForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Patch gtask fields after syncing a todo to/from Google Tasks
export const patchGtaskFields = internalMutation({
  args: {
    id: v.id("todos"),
    gtaskId: v.optional(v.string()),
    gtaskListId: v.optional(v.string()),
    gtaskUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, gtaskId, gtaskListId, gtaskUpdatedAt }) => {
    await ctx.db.patch(id, { gtaskId, gtaskListId, gtaskUpdatedAt });
  },
});

// Create a todo from a Google Task (GTasks → LifeLup direction)
export const createFromGtask = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    dueAt: v.optional(v.number()),       // may be absent — Google Tasks due dates are optional
    gtaskId: v.string(),
    gtaskListId: v.string(),
    gtaskUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("todos", {
      userId: args.userId,
      text: args.text,
      completed: false,
      dueAt: args.dueAt,
      gtaskId: args.gtaskId,
      gtaskListId: args.gtaskListId,
      gtaskUpdatedAt: args.gtaskUpdatedAt,
      lifelupUpdatedAt: 0,  // Why: 0 means "never edited in LifeLup" → agent won't re-push
      category: "other",
    });
  },
});

// Set completed flag (used by Tasks sync when a Google Task is marked done)
export const setCompleted = internalMutation({
  args: { id: v.id("todos"), completed: v.boolean() },
  handler: async (ctx, { id, completed }) => {
    await ctx.db.patch(id, { completed });
  },
});
```

---

### Task 4: HTTP Endpoints — `convex/http.ts` additions
**File:** `convex/http.ts`
**Action:** Modify — append before `export default http`
**Depends on:** Tasks 2, 3

Six new endpoints for the Tasks sync agent (append in a new section after the GCal block):

```typescript
// ─── Google Tasks sync endpoints ─────────────────────────────────────────────

// GET /agent/v1/gtask-tokens — users with tasksScope=true
http.route({
  path: "/agent/v1/gtask-tokens",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const tokens = await ctx.runQuery(internal.googleCalendar.getTasksTokens);
    return Response.json(tokens);
  }),
});

// POST /agent/v1/gtask-tokens-update — update access token after refresh
http.route({
  path: "/agent/v1/gtask-tokens-update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId, accessToken, expiresAt } = await req.json();
    await ctx.runMutation(internal.googleCalendar.updateAccessToken, { userId, accessToken, expiresAt });
    return Response.json({ ok: true });
  }),
});

// GET /agent/v1/gtask-todos?userId=... — ALL todos for a user (not filtered by dueAt)
http.route({
  path: "/agent/v1/gtask-todos",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return new Response("Missing userId", { status: 400 });
    const todos = await ctx.runQuery(internal.todos.getAllTodosForUser, { userId: userId as Id<"users"> });
    return Response.json(todos);
  }),
});

// POST /agent/v1/gtask-todo-update — patch gtaskId, gtaskListId, gtaskUpdatedAt (and optionally completed)
http.route({
  path: "/agent/v1/gtask-todo-update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { id, gtaskId, gtaskListId, gtaskUpdatedAt, completed } = await req.json();
    await ctx.runMutation(internal.todos.patchGtaskFields, { id, gtaskId, gtaskListId, gtaskUpdatedAt });
    if (typeof completed === "boolean") {
      await ctx.runMutation(internal.todos.setCompleted, { id, completed });
    }
    return Response.json({ ok: true });
  }),
});

// POST /agent/v1/gtask-todo-create — create todo from a Google Task
http.route({
  path: "/agent/v1/gtask-todo-create",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    await ctx.runMutation(internal.todos.createFromGtask, body);
    return Response.json({ ok: true });
  }),
});

// POST /agent/v1/gtask-sync-done — update lastTasksSyncAt and optionally cache defaultTaskListId
http.route({
  path: "/agent/v1/gtask-sync-done",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId, lastTasksSyncAt, defaultTaskListId } = await req.json();
    await ctx.runMutation(internal.googleCalendar.updateLastTasksSync, { userId, lastTasksSyncAt });
    if (defaultTaskListId) {
      await ctx.runMutation(internal.googleCalendar.updateDefaultTaskList, { userId, defaultTaskListId });
    }
    return Response.json({ ok: true });
  }),
});
```

---

### Task 5: OAuth scope update — `app/integrations/page.tsx`
**File:** `app/integrations/page.tsx`
**Action:** Modify
**Depends on:** Task 1 (for `tasksScope` field)

**5a. Update `buildGoogleOAuthUrl`** — add Tasks scope alongside Calendar scope:
```typescript
// Old:
scope: "https://www.googleapis.com/auth/calendar",
// New:
scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks",
```

**5b. Add Google Tasks card** — append after the closing `</div>` of the Google Calendar card (before `</div>` of the outer container). The card shows:
- If `token` is null (no connection at all): disabled card with message "Connectez d'abord Google Agenda"
- If `token` exists but `token.tasksScope` is not `true`: yellow warning card "Reconnectez Google pour activer Google Tasks" + "Reconnecter" button that calls `buildGoogleOAuthUrl` (triggers re-consent with updated scopes)
- If `token.tasksScope === true`: green "Connecté" badge + last sync time (`token.lastTasksSyncAt`) + description

```tsx
{/* Google Tasks card */}
<div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
      {/* Checkmark/Tasks icon */}
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-500" fill="currentColor">
        <path d="M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zm-2.21 5.04c.13.57.21 1.17.21 1.78 0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8c1.58 0 3.04.46 4.28 1.25l1.44-1.44A9.9 9.9 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.19-.22-2.33-.6-3.39l-1.61 1.61z"/>
      </svg>
    </div>
    <div>
      <h3 className="font-medium text-gray-900 dark:text-white">Google Tasks</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Synchronisez vos todos avec Google Tasks (bidirectionnel).
      </p>
    </div>
  </div>

  {!token ? (
    <p className="text-xs text-gray-400 dark:text-gray-500">
      Connectez d&apos;abord Google Agenda pour activer Google Tasks.
    </p>
  ) : !token.tasksScope ? (
    <div className="space-y-3">
      <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
        Reconnectez votre compte Google pour activer la synchronisation Google Tasks.
      </div>
      <button
        disabled={!userId}
        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors disabled:opacity-50"
        onClick={() => {
          if (!userId) return;
          window.location.href = buildGoogleOAuthUrl(userId, userEmail);
        }}
      >
        Reconnecter Google
      </button>
    </div>
  ) : (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Connecté
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{token.googleEmail}</span>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Dernière sync Tasks:{" "}
        {token.lastTasksSyncAt ? relativeTime(token.lastTasksSyncAt) : "Jamais"}
      </p>
    </div>
  )}
</div>
```

---

### Task 6: OAuth callback — `app/api/auth/google/callback/route.ts`
**File:** `app/api/auth/google/callback/route.ts`
**Action:** Modify — after saving the token, detect whether the Tasks scope was granted and call `setTasksScope`
**Depends on:** Task 2

After the existing `gcal-oauth-save` fetch, add:
```typescript
// Check if Tasks scope was granted (present in token response scopes)
const grantedScopes: string = (await fetch("https://www.googleapis.com/oauth2/v2/tokeninfo?access_token=" + access_token)
  .then(r => r.json())
  .then(d => d.scope ?? "")
  .catch(() => ""));

if (grantedScopes.includes("tasks")) {
  await fetch(`${convexHttpUrl}/agent/v1/gtask-scope-set`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentSecret}` },
    body: JSON.stringify({ userId }),
  });
}
```

Also add a new Convex HTTP endpoint `/agent/v1/gtask-scope-set` in `convex/http.ts` (can be added to Task 4):
```typescript
// POST /agent/v1/gtask-scope-set — mark tasksScope=true after re-authorization
http.route({
  path: "/agent/v1/gtask-scope-set",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId } = await req.json();
    await ctx.runMutation(internal.googleCalendar.setTasksScope, { userId });
    return Response.json({ ok: true });
  }),
});
```

> Note: Add this endpoint to the Google Tasks section in Task 4 (making it 7 endpoints total).

---

### Task 7: Agent — `lifelup-agent/tasks-sync.mjs`
**File:** `lifelup-agent/tasks-sync.mjs`
**Action:** Create
**Depends on:** Tasks 1-4

Model after `calendar-sync.mjs`. Key differences:
- Uses Google Tasks API (`https://tasks.googleapis.com/tasks/v1`) instead of Calendar API
- Fetches ALL task lists for each user, then tasks from each list
- Syncs ALL LifeLup todos (no `dueAt` filter)
- Handles `status: "completed"` from Google Tasks → marks LifeLup todo completed

```javascript
// lifelup-agent/tasks-sync.mjs
// Bilateral sync: LifeLup todos ↔ Google Tasks
// PM2 runs this every 15 min via cron_restart

const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const AGENT_SECRET = process.env.AGENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";

const headers = { Authorization: `Bearer ${AGENT_SECRET}`, "Content-Type": "application/json" };

async function get(path) {
  const res = await fetch(`${CONVEX_SITE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function ensureFreshToken(token) {
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const { access_token, expires_in } = await res.json();
  const expiresAt = Date.now() + expires_in * 1000;
  await post("/agent/v1/gtask-tokens-update", { userId: token.userId, accessToken: access_token, expiresAt });
  return access_token;
}

async function syncUser(token) {
  const accessToken = await ensureFreshToken(token);
  const gHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  // ─── Resolve default task list ────────────────────────────────────────────
  let defaultListId = token.defaultTaskListId;
  if (!defaultListId) {
    const listsRes = await fetch(`${TASKS_BASE}/users/@me/lists`, { headers: gHeaders });
    const { items: lists = [] } = await listsRes.json();
    defaultListId = lists[0]?.id;
    if (!defaultListId) {
      console.warn(`[tasks-sync] No task lists found for ${token.googleEmail}`);
      return;
    }
  }

  // ─── LifeLup todos ────────────────────────────────────────────────────────
  const todos = await get(`/agent/v1/gtask-todos?userId=${token.userId}`);
  const gtaskIdToTodo = new Map(todos.filter(t => t.gtaskId).map(t => [t.gtaskId, t]));

  // ─── LifeLup → GTasks ────────────────────────────────────────────────────
  for (const todo of todos) {
    if (todo.completed && todo.gtaskId) {
      // Mark Google Task as completed
      await fetch(`${TASKS_BASE}/lists/${todo.gtaskListId ?? defaultListId}/tasks/${todo.gtaskId}`, {
        method: "PATCH", headers: gHeaders,
        body: JSON.stringify({ status: "completed" }),
      });
    } else if (!todo.gtaskId && !todo.completed) {
      // Create new Google Task for this LifeLup todo
      const body = { title: todo.text };
      if (todo.dueAt) body.due = new Date(todo.dueAt).toISOString();
      const res = await fetch(`${TASKS_BASE}/lists/${defaultListId}/tasks`, {
        method: "POST", headers: gHeaders, body: JSON.stringify(body),
      });
      const task = await res.json();
      if (!task.id) {
        console.error(`[tasks-sync] GTasks create failed for todo ${todo._id}:`, JSON.stringify(task));
        continue;
      }
      const gtaskUpdatedAt = task.updated ? new Date(task.updated).getTime() : Date.now();
      await post("/agent/v1/gtask-todo-update", {
        id: todo._id, gtaskId: task.id, gtaskListId: defaultListId, gtaskUpdatedAt,
      });
    } else if (todo.gtaskId && !todo.completed) {
      // Update GTask only if LifeLup version was edited after last GTask sync
      const lifelupEditedAt = todo.lifelupUpdatedAt ?? 0;
      if (lifelupEditedAt > (todo.gtaskUpdatedAt ?? 0)) {
        const body = { title: todo.text };
        if (todo.dueAt) body.due = new Date(todo.dueAt).toISOString();
        const res = await fetch(`${TASKS_BASE}/lists/${todo.gtaskListId ?? defaultListId}/tasks/${todo.gtaskId}`, {
          method: "PATCH", headers: gHeaders, body: JSON.stringify(body),
        });
        const task = await res.json();
        if (!task.id) {
          console.error(`[tasks-sync] GTasks patch failed for todo ${todo._id}:`, JSON.stringify(task));
          continue;
        }
        const gtaskUpdatedAt = task.updated ? new Date(task.updated).getTime() : Date.now();
        await post("/agent/v1/gtask-todo-update", {
          id: todo._id, gtaskId: task.id, gtaskListId: todo.gtaskListId ?? defaultListId, gtaskUpdatedAt,
        });
      }
    }
  }

  // ─── GTasks → LifeLup ────────────────────────────────────────────────────
  // Fetch all task lists to catch tasks added in non-default lists
  const listsRes = await fetch(`${TASKS_BASE}/users/@me/lists`, { headers: gHeaders });
  const { items: allLists = [] } = await listsRes.json();

  const updatedMin = token.lastTasksSyncAt
    ? new Date(token.lastTasksSyncAt).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days on first run

  for (const list of allLists) {
    const tasksRes = await fetch(
      `${TASKS_BASE}/lists/${list.id}/tasks?showCompleted=true&updatedMin=${encodeURIComponent(updatedMin)}&maxResults=100`,
      { headers: gHeaders }
    );
    const { items: tasks = [] } = await tasksRes.json();

    for (const task of tasks) {
      const gtaskUpdatedAt = task.updated ? new Date(task.updated).getTime() : Date.now();
      const dueAt = task.due ? new Date(task.due).getTime() : undefined;

      if (!gtaskIdToTodo.has(task.id)) {
        // New task — create LifeLup todo (skip already-completed tasks on first import)
        if (task.status === "completed") continue;
        await post("/agent/v1/gtask-todo-create", {
          userId: token.userId,
          text: task.title ?? "(Sans titre)",
          dueAt,
          gtaskId: task.id,
          gtaskListId: list.id,
          gtaskUpdatedAt: Date.now(), // Why: use sync time so LifeLup→GTasks won't re-push immediately
        });
        gtaskIdToTodo.set(task.id, { gtaskId: task.id }); // prevent double-create in same run
      } else {
        // Existing todo — sync completion + update gtaskUpdatedAt if GTask is newer
        const matchingTodo = gtaskIdToTodo.get(task.id);
        if (task.status === "completed" && !matchingTodo.completed) {
          await post("/agent/v1/gtask-todo-update", {
            id: matchingTodo._id,
            gtaskUpdatedAt,
            completed: true,
          });
        } else if (gtaskUpdatedAt > (matchingTodo.gtaskUpdatedAt ?? 0)) {
          await post("/agent/v1/gtask-todo-update", {
            id: matchingTodo._id,
            gtaskId: task.id,
            gtaskListId: list.id,
            gtaskUpdatedAt,
          });
        }
      }
    }
  }

  // Mark sync complete
  await post("/agent/v1/gtask-sync-done", {
    userId: token.userId,
    lastTasksSyncAt: Date.now(),
    defaultTaskListId: defaultListId,
  });
}

async function main() {
  console.log(`[tasks-sync] Starting sync at ${new Date().toISOString()}`);
  const tokens = await get("/agent/v1/gtask-tokens");
  console.log(`[tasks-sync] ${tokens.length} user(s) with Tasks scope`);
  for (const token of tokens) {
    try {
      await syncUser(token);
      console.log(`[tasks-sync] Synced user ${token.googleEmail}`);
    } catch (err) {
      console.error(`[tasks-sync] Error syncing ${token.googleEmail}:`, err.message);
    }
  }
  console.log("[tasks-sync] Done.");
}

main().catch(console.error);
```

---

### Task 8: PM2 config — `lifelup-agent/ecosystem.config.cjs`
**File:** `lifelup-agent/ecosystem.config.cjs`
**Action:** Modify — add new entry to the `apps` array
**Depends on:** Task 7

```javascript
{
  name: "lifelup-tasks-sync",
  script: "/home/claude/dev/lifelup-agent/tasks-sync.mjs",
  interpreter: "node",
  cron_restart: "*/15 * * * *",
  autorestart: false,
  env: {
    AGENT_SECRET: "de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4",
    CONVEX_SITE_URL: "https://convex.aidigitalassistant.cloud",
    GOOGLE_CLIENT_ID: "<GOOGLE_CLIENT_ID>",
    GOOGLE_CLIENT_SECRET: "<GOOGLE_CLIENT_SECRET>",
  }
},
```

---

### Task 9: Build Validation
**Action:** Run
**Depends on:** Tasks 1-8

```bash
cd /home/claude/dev/lifelUp
npm run build
npm run lint
```

Fix any TypeScript or lint errors before proceeding.

---

### Task 10: Convex Deploy
**Action:** Run
**Depends on:** Task 9

```bash
cd /home/claude/dev/lifelUp
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy
```

Watch for: new fields on `todos`, new fields on `googleCalendarTokens`, no removed indexes.

---

### Task 11: Start PM2 agent
**Action:** Run on VPS
**Depends on:** Task 10

```bash
# On VPS — after deploying code:
cd /home/claude/dev/lifelup-agent
pm2 start ecosystem.config.cjs --only lifelup-tasks-sync
pm2 save

# Verify it ran:
pm2 logs lifelup-tasks-sync --lines 30 --nostream
```

---

## Validation Sequence

```bash
# 1. TypeScript build
cd /home/claude/dev/lifelUp && npm run build 2>&1 | tail -20

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. Convex deploy
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy

# 4. Bearer token auth check on new endpoints
# Must return 401:
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/gtask-tokens

# Must return valid JSON:
curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/gtask-tokens

# 5. Manual verification
# Open https://lifelup.aidigitalassistant.cloud/integrations
# Confirm Google Tasks card is visible
# If already connected: confirm "Reconnectez" prompt appears (tasksScope not yet set)
# Click "Reconnecter Google" → re-authorize with updated scopes
# Confirm tasksScope=true and card shows "Connecté"
# Create a todo in LifeLup → wait 15 min (or: pm2 start lifelup-tasks-sync manually)
# Confirm todo appears in Google Tasks

# 6. Production deploy
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup

# 7. Start tasks-sync agent on VPS
cd /home/claude/dev/lifelup-agent
pm2 start ecosystem.config.cjs --only lifelup-tasks-sync
pm2 save
```

---

## Known Risks

- **`lifelupUpdatedAt` not set on existing todos** — todos created before this feature have `lifelupUpdatedAt: undefined`. The sync agent treats `undefined ?? 0` as 0, so they will push to GTasks on first run (correct behavior — creates GTask for existing todos). No migration needed.
- **Re-authorization required** — existing connected users must click "Reconnecter" once to gain the Tasks scope. Until then, `tasksScope` is `false` and tasks-sync skips them.
- **Google Tasks rate limits** — Tasks API has a 50,000 requests/day quota per project. With 4 users × 96 runs/day × ~10 API calls/run = ~3,840 calls/day. Well within limit.
- **`api.d.ts`** — no new Convex module is added, so `api.d.ts` does NOT need updating. Both `googleCalendar.ts` and `todos.ts` already appear there.
- **Always:** `npx convex deploy` required after any `schema.ts` change.
- **PM2 delete+start rule** — never use `pm2 restart lifelup-tasks-sync --update-env`. Use `pm2 delete lifelup-tasks-sync && pm2 start ecosystem.config.cjs --only lifelup-tasks-sync`.

---

## Confidence Score

**Score:** 9/10
**Reason:** Pattern is a near-exact copy of the Google Calendar sync (already shipped and working). All integration points — token table, OAuth flow, PM2 agent structure, HTTP endpoints, bilateral last-write-wins logic — are proven. The only novelty is the multi-list traversal in GTasks → LifeLup direction and the `tasksScope` gating. INITIAL.md specifies the schema additions, API endpoints, and sync algorithm precisely. Small risk: the OAuth callback scope-detection step (Task 6) requires testing to confirm Google returns scopes in the tokeninfo response.

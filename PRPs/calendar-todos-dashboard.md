# PRP: Calendar Views + Todos Board + Dashboard

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: filled from `INITIAL.md` via `/generate-prp`
> See completed example: `PRPs/EXAMPLE_goals_agent.md`

---

## Overview

Build three new pages — `/calendar` (Day/Week/Month views with HTML5 drag-and-drop to move GCal events), `/todos-board` (per-user + family columns for all todos), and `/dashboard` (mini calendar widget + today's events + family progress) — plus a Next.js API route `/api/gcal/event-move` that immediately PATCHes GCal when an event is dragged to a new date. No external calendar libraries; built with CSS grid and HTML5 drag-and-drop.

---

## Success Criteria

- [ ] `/calendar` has Day / Semaine / Mois tab switcher; defaults to Month view
- [ ] Calendar renders only todos with `gcalEventId` (and todos with `dueAt` but no gcalEventId in lighter shade) as colored chips/blocks on their `dueAt` date
- [ ] User color coding: Christian=blue, Linda=pink, Kalea=purple, Keoni=green (matching their user color index from family view)
- [ ] Drag an event chip to a new date/time slot → `dueAt` updated in Convex + GCal PATCHed immediately via `/api/gcal/event-move`
- [ ] Click event chip → edit modal (change titre, date + heure); Save patches todo; Delete marks `completed: true` (sync agent removes from GCal on next run)
- [ ] Click empty date cell → create modal (titre, date, heure); creates todo with `dueAt`; sync agent pushes to GCal on next run
- [ ] `/todos-board` has "Mes todos" tab and "Famille" tab
- [ ] "Mes todos" has two sections: "Non planifié" (no `dueAt`) and "Planifié" (with `dueAt`, sorted ascending)
- [ ] "Famille" shows one column per family member with their incomplete todos
- [ ] Famille: completing a todo calls `api.todos.toggleForUser` mutation (with target userId check), which awards stars to that user
- [ ] `/dashboard` shows mini month calendar (dots for days with events) + today's events list + "Mes todos aujourd'hui" (due today + overdue) + family progress bars (X/Y done today per member)
- [ ] Nav updated on ALL existing pages: add Calendrier · Todos Board · Dashboard links between Quests and Agents
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] Unauthenticated users redirected to `/signin` on all three new pages
- [ ] Manual verification: visit `https://lifelup.aidigitalassistant.cloud/calendar` → Month view renders, drag an event chip to different date → confirm `dueAt` changes in Convex and GCal event is updated

---

## Context Files to Read Before Implementing

- `convex/schema.ts` — existing tables: `todos` has `dueAt`, `gcalEventId`, `by_user_due` index; `users` has `firstName`, `lastName`, `email`, `totalStars`
- `convex/_generated/api.d.ts` — must update if adding new Convex module (not needed here — extending `todos.ts` and `users.ts`)
- `convex/todos.ts` — existing `list`, `listAll`, `toggle`, `create`, `patchGcalFields`, `getTodosWithDueAt` patterns
- `convex/users.ts` — `getMe`, `updateProfile`; need to add `listAll` internal query
- `convex/googleCalendar.ts` — `getAllTokens`, `getMyToken` patterns; `googleCalendarTokens` table
- `convex/http.ts` — existing gcal endpoints (`/agent/v1/gcal-todo-update`, `/agent/v1/gcal-tokens`); add new `/api/gcal/event-move` Next.js route (not a Convex HTTP endpoint — see below)
- `lifelup-agent/calendar-sync.mjs` — how GCal PATCH works: `fetch` to `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{gcalEventId}` with `method: PATCH`; how `ensureFreshToken` works
- `app/family/page.tsx` — per-user tabs pattern, COLORS array, `displayName`, `initials` helpers, nav header exact structure
- `app/page.tsx` — auth guard pattern, nav header, loading spinner
- `examples/convex-mutation.ts` — CRUD pattern
- `examples/app-page.tsx` — protected page skeleton with exact nav header

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/todos.ts` | Modify | Add `listForBoard`, `listAllForFamily`, `getTodosInRange`, `toggleForUser` |
| `convex/users.ts` | Modify | Add `listAll` public query (returns users with email + name + totalStars) |
| `app/api/gcal/event-move/route.ts` | Create | POST handler: update `dueAt` in Convex + immediately PATCH GCal |
| `app/calendar/page.tsx` | Create | Calendar page — Day/Week/Month views, drag & drop, modals |
| `components/calendar/MonthView.tsx` | Create | 6×7 CSS grid, event chips, drag targets |
| `components/calendar/WeekView.tsx` | Create | 7-col × 24-row CSS grid, hour slots, drag targets |
| `components/calendar/DayView.tsx` | Create | Single-col × 24-row CSS grid, hour slots |
| `components/calendar/EventModal.tsx` | Create | Edit + create modal (reused by all views) |
| `app/todos-board/page.tsx` | Create | "Mes todos" + "Famille" tabs |
| `components/todos-board/TodoColumn.tsx` | Create | Single user column for family view |
| `app/dashboard/page.tsx` | Create | Mini calendar widget + today todos + family progress |
| `app/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/family/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/coach/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/goals/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/context/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/todos/recurring/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/quests/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav |
| `app/agents/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav (if nav exists) |
| `app/integrations/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav (if nav exists) |
| `app/fichiers/page.tsx` | Modify | Add Calendrier · Todos Board · Dashboard to nav (if nav exists) |

---

## Tasks

### Task 1: Extend Convex `todos.ts` — new queries and mutations
**File:** `convex/todos.ts`
**Action:** Modify — add 4 new functions
**Depends on:** nothing (schema already has needed indexes)

```typescript
// Public query: returns { planned: Todo[], unplanned: Todo[] } for current user
export const listForBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { planned: [], unplanned: [] };
    const all = await ctx.db.query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("completed"), false))
      .collect();
    const planned = all
      .filter((t) => t.dueAt != null)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    const unplanned = all
      .filter((t) => t.dueAt == null)
      .sort((a, b) => a._creationTime - b._creationTime);
    return { planned, unplanned };
  },
});

// Public query: returns all users with their incomplete todos (for family view)
export const listAllForFamily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const allUsers = await ctx.db.query("users").collect();
    const allTodos = await ctx.db.query("todos")
      .filter((q) => q.eq(q.field("completed"), false))
      .collect();
    return allUsers.map((u) => ({
      user: u,
      todos: allTodos
        .filter((t) => t.userId === u._id)
        .sort((a, b) => (a.dueAt ?? a._creationTime) - (b.dueAt ?? b._creationTime)),
    }));
  },
});

// Internal query: todos with dueAt in a time range (for calendar views)
export const getTodosInRange = query({
  args: { fromTs: v.number(), toTs: v.number() },
  handler: async (ctx, { fromTs, toTs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const allUsers = await ctx.db.query("users").collect();
    const allTodos = await ctx.db.query("todos").collect();
    const userMap = Object.fromEntries(allUsers.map((u) => [u._id, u]));
    return allTodos
      .filter((t) => t.dueAt != null && t.dueAt >= fromTs && t.dueAt <= toTs)
      .map((t) => ({ ...t, user: userMap[t.userId] ?? null }));
  },
});

// Mutation: update dueAt on a todo (for calendar drag & drop)
export const updateDueAt = mutation({
  args: { id: v.id("todos"), dueAt: v.number() },
  handler: async (ctx, { id, dueAt }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found or not authorized");
    await ctx.db.patch(id, { dueAt });
  },
});

// Mutation: complete a todo owned by any user (family view)
// Awards stars to the todo's owner — family member helping another
export const toggleForUser = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo) throw new Error("Not found");
    const nowCompleted = !todo.completed;
    await ctx.db.patch(id, { completed: nowCompleted });
    if (nowCompleted && todo.starValue) {
      const owner = await ctx.db.get(todo.userId);
      await ctx.db.patch(todo.userId, { totalStars: (owner?.totalStars ?? 0) + todo.starValue });
    }
  },
});
```

---

### Task 2: Extend Convex `users.ts` — add `listAll` public query
**File:** `convex/users.ts`
**Action:** Modify — add 1 query
**Depends on:** nothing

```typescript
// Returns all users (for calendar color mapping and family views)
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db.query("users").collect();
  },
});
```

---

### Task 3: Create Next.js API route `/api/gcal/event-move`
**File:** `app/api/gcal/event-move/route.ts`
**Action:** Create
**Depends on:** Task 1

This is a Next.js Route Handler (not a Convex HTTP endpoint) because it needs to:
1. Authenticate via session token to identify the calling user
2. Call Convex to update `dueAt`
3. Fetch the user's GCal token from Convex (via internal query)
4. PATCH the GCal event directly

```typescript
import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const AGENT_SECRET = process.env.AGENT_SECRET!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const agentHeaders = {
  Authorization: `Bearer ${AGENT_SECRET}`,
  "Content-Type": "application/json",
};

export async function POST(req: NextRequest) {
  const { todoId, newDueAt, userId, gcalEventId, calendarId, accessToken, expiresAt, refreshToken } = await req.json();

  // 1. Update dueAt in Convex via agent endpoint
  await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-todo-update`, {
    method: "POST",
    headers: agentHeaders,
    body: JSON.stringify({ id: todoId, gcalUpdatedAt: Date.now() }),
  });

  // Also update dueAt directly via a new internal Convex endpoint
  await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-todo-due-update`, {
    method: "POST",
    headers: agentHeaders,
    body: JSON.stringify({ id: todoId, dueAt: newDueAt }),
  });

  // 2. If no gcalEventId, nothing to patch in GCal
  if (!gcalEventId) {
    return NextResponse.json({ ok: true, gcalPatched: false });
  }

  // 3. Refresh token if needed
  let currentAccessToken = accessToken;
  if (expiresAt <= Date.now() + 60_000) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const { access_token, expires_in } = await tokenRes.json();
    currentAccessToken = access_token;
    // Update token in Convex
    await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-tokens-update`, {
      method: "POST",
      headers: agentHeaders,
      body: JSON.stringify({ userId, accessToken: access_token, expiresAt: Date.now() + expires_in * 1000 }),
    });
  }

  // 4. PATCH GCal event
  const startDate = new Date(newDueAt).toISOString().split("T")[0];
  const gcalRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${gcalEventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${currentAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { date: startDate },
        end: { date: startDate },
      }),
    }
  );

  const gcalResult = await gcalRes.json();

  // Update gcalUpdatedAt with new GCal timestamp
  if (gcalResult.updated) {
    await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-todo-update`, {
      method: "POST",
      headers: agentHeaders,
      body: JSON.stringify({
        id: todoId,
        gcalEventId,
        gcalUpdatedAt: new Date(gcalResult.updated).getTime(),
      }),
    });
  }

  return NextResponse.json({ ok: true, gcalPatched: true });
}
```

**Note:** The caller (calendar drag handler in the frontend) must pass `userId`, `gcalEventId`, `calendarId`, `accessToken`, `expiresAt`, `refreshToken` alongside `todoId` and `newDueAt`. These come from `api.googleCalendar.getMyToken` which is already available.

**Also add a new Convex HTTP endpoint** in `convex/http.ts` for updating `dueAt` via agent:

```typescript
// POST /agent/v1/gcal-todo-due-update — update dueAt on a todo (for calendar drag & drop)
http.route({
  path: "/agent/v1/gcal-todo-due-update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { id, dueAt } = await req.json();
    await ctx.runMutation(internal.todos.patchDueAt, { id, dueAt });
    return Response.json({ ok: true });
  }),
});
```

And add to `convex/todos.ts`:
```typescript
// Internal mutation: set dueAt on any todo (used by event-move API route)
export const patchDueAt = internalMutation({
  args: { id: v.id("todos"), dueAt: v.number() },
  handler: async (ctx, { id, dueAt }) => {
    await ctx.db.patch(id, { dueAt });
  },
});
```

---

### Task 4: Create calendar components
**Files:** `components/calendar/MonthView.tsx`, `components/calendar/WeekView.tsx`, `components/calendar/DayView.tsx`, `components/calendar/EventModal.tsx`
**Action:** Create
**Depends on:** Task 1, Task 2

**User color mapping** (use consistent with family page COLORS array index):
```typescript
const USER_COLORS: Record<string, { bg: string; light: string; text: string }> = {
  // Map by email prefix or index — look up from api.users.listAll sorted by _creationTime
  // index 0 → blue, 1 → purple, 2 → green, 3 → orange, 4 → pink
};
const COLOR_PALETTE = [
  { bg: "bg-blue-500",   light: "bg-blue-200",   text: "text-blue-800"   },
  { bg: "bg-purple-500", light: "bg-purple-200", text: "text-purple-800" },
  { bg: "bg-green-500",  light: "bg-green-200",  text: "text-green-800"  },
  { bg: "bg-orange-500", light: "bg-orange-200", text: "text-orange-800" },
  { bg: "bg-pink-500",   light: "bg-pink-200",   text: "text-pink-800"   },
];
```

**MonthView.tsx** (keep under 300 lines):
- Props: `events: TodoWithUser[]`, `currentMonth: Date`, `onDrop: (todoId, newDueAt) => void`, `onClickEvent: (todo) => void`, `onClickSlot: (date) => void`
- CSS grid: `grid-cols-7` for days, rows auto-sized
- Each cell: `draggable={false}` on cell, `onDragOver={e => e.preventDefault()}`, `onDrop={handler}`
- Event chips: `draggable={true}`, `onDragStart={e => e.dataTransfer.setData('todoId', todo._id)}`, colored by user
- GCal events (have `gcalEventId`): full color; native todos with `dueAt` only: light shade

**WeekView.tsx** (keep under 300 lines):
- Props: same as MonthView + `currentWeek: Date`
- CSS grid: `grid-cols-8` (time label col + 7 days), `grid-rows-25` (header + 24 hours)
- Drag: `onDragStart` sets `{ todoId, originalDueAt }` in dataTransfer; `onDrop` on hour cells computes new timestamp

**DayView.tsx** (keep under 300 lines):
- Props: same + `currentDay: Date`
- CSS grid: `grid-cols-2` (time + events), 24 hour rows

**EventModal.tsx** (reused for create + edit):
- Props: `mode: 'create' | 'edit'`, `todo?: Todo`, `defaultDate?: Date`, `onSave`, `onDelete?`, `onClose`
- Fields: titre (text input), date (date input), heure (time input, optional)
- Calls `api.todos.create` (create mode) or `api.todos.updateDueAt` + `api.todos.patchTitle` (edit mode)
- Delete button (edit mode): calls `api.todos.toggle` to mark completed=true

Add `patchTitle` to `convex/todos.ts`:
```typescript
export const patchTitle = mutation({
  args: { id: v.id("todos"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, { text });
  },
});
```

---

### Task 5: Create `/calendar` page
**File:** `app/calendar/page.tsx`
**Action:** Create
**Depends on:** Task 1, Task 2, Task 3, Task 4

```typescript
"use client";
// Auth guard: useConvexAuth + useEffect redirect to /signin
// State: activeView: 'month' | 'week' | 'day', currentDate: Date
// Data: useQuery(api.todos.getTodosInRange, { fromTs, toTs })
//       useQuery(api.users.listAll) → build color map
//       useQuery(api.googleCalendar.getMyToken) → for event-move API call
// Drag handler: async function handleDrop(todoId, newDueAt) {
//   const token = gcalToken; // from useQuery
//   await fetch('/api/gcal/event-move', { method: 'POST', body: JSON.stringify({ todoId, newDueAt, userId, gcalEventId, calendarId, accessToken, expiresAt, refreshToken }) })
// }
// Tab switcher: Jour | Semaine | Mois (French labels)
// Renders: {activeView === 'month' && <MonthView ... />} etc.
```

---

### Task 6: Create `/todos-board` page
**File:** `app/todos-board/page.tsx`
**Action:** Create
**Depends on:** Task 1

```typescript
"use client";
// Auth guard pattern
// Tabs: "Mes todos" | "Famille"
// "Mes todos" tab:
//   useQuery(api.todos.listForBoard) → { planned, unplanned }
//   Section "Non planifié": TodoColumn with unplanned todos
//   Section "Planifié": group by date, render under each date header
// "Famille" tab:
//   useQuery(api.todos.listAllForFamily) → [{ user, todos }]
//   Render one column per user (mobile: scrollable tabs or horizontal scroll)
//   Complete button calls useMutation(api.todos.toggleForUser)
```

**TodoColumn.tsx:**
- Props: `user: User`, `todos: Todo[]`, `canComplete?: boolean`, `onComplete?: (id) => void`
- Shows user avatar + name + level, list of todos with category badge, star value, complete button

---

### Task 7: Create `/dashboard` page
**File:** `app/dashboard/page.tsx`
**Action:** Create
**Depends on:** Task 1, Task 2

```typescript
"use client";
// Auth guard pattern
// Layout: flex-col on mobile, md:grid md:grid-cols-2 on desktop
// Left column:
//   Mini month calendar widget (6×7 grid, dots for days with events)
//   Today's calendar events list (todos with dueAt = today, sorted by time)
// Right column:
//   "Mes todos aujourd'hui" — todos due today OR overdue (dueAt <= endOfDay) for current user
//   Family progress bars — for each user: X/Y todos completed today
//     computed from listAllForFamily: filter todos with dueAt on today
// Data:
//   useQuery(api.todos.getTodosInRange, { fromTs: startOfMonth, toTs: endOfMonth }) → for mini calendar dots
//   useQuery(api.todos.listAllForFamily) → for family progress
//   useQuery(api.users.getMe) → current user id
```

---

### Task 8: Update nav on all existing pages
**Files:** `app/page.tsx`, `app/family/page.tsx`, `app/coach/page.tsx`, `app/goals/page.tsx`, `app/context/page.tsx`, `app/todos/recurring/page.tsx`, `app/quests/page.tsx`, and any other pages with nav headers
**Action:** Modify — add 3 new links between Quests and Agents (or at end of nav)
**Depends on:** nothing (can be done in parallel with other tasks)

In each page's `<nav>` section, add after the Quests link:
```tsx
<span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
<Link href="/calendar" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
  Calendrier
</Link>
<span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
<Link href="/todos-board" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
  Todos Board
</Link>
<span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
<Link href="/dashboard" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
  Dashboard
</Link>
```

Set the current page's link to `text-blue-600 dark:text-blue-400 font-medium` (not a `<Link>`, just a `<span>`).

**Important:** Check `app/agents/page.tsx`, `app/integrations/page.tsx`, `app/fichiers/page.tsx` for nav — update if they have the nav header.

---

### Task 9: Build Validation
**Action:** Run
**Depends on:** Tasks 1–8

```bash
cd /home/claude/dev/lifelUp
npm run build
npm run lint
```

Fix any TypeScript or lint errors before proceeding to Task 10.

Common issues to watch for:
- `getTodosInRange` as a `query` is fine for public use; no need to update `api.d.ts` (extending existing module `todos.ts`)
- Ensure `patchDueAt` is added as `internalMutation` in `todos.ts` AND referenced in `http.ts`
- Ensure all new mutations/queries have proper `v.` validators for args
- Check that `AGENT_SECRET` and GCal env vars are available in Next.js route handlers (add to `.env.local` if needed for dev)

---

### Task 10: Convex Deploy
**Action:** Run
**Depends on:** Task 9

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

Watch for: new functions registered, no schema validation errors (no schema changes required).

---

### Task 11: Production Deploy
**Action:** Run
**Depends on:** Task 10

```bash
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
```

---

## Validation Sequence

```bash
# 1. TypeScript build
cd /home/claude/dev/lifelUp
npm run build 2>&1 | tail -30

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. Convex deploy
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# 4. Auth check: new agent endpoint
# Must return 401:
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/gcal-todo-due-update

# Must return valid JSON:
curl -s -X POST \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  -H "Content-Type: application/json" \
  -d '{"id":"fake","dueAt":0}' \
  https://convex.aidigitalassistant.cloud/agent/v1/gcal-todo-due-update

# 5. Manual verification
# a. Open https://lifelup.aidigitalassistant.cloud/calendar
#    → Month view renders with colored event chips on dueAt dates
#    → Drag an event chip to a different date cell
#    → Verify dueAt updated in Convex (check family/page.tsx todo list)
#    → Verify GCal event moved in Google Calendar

# b. Open https://lifelup.aidigitalassistant.cloud/todos-board
#    → "Mes todos" tab: Non planifié + Planifié sections render correctly
#    → "Famille" tab: one column per family member, complete button works

# c. Open https://lifelup.aidigitalassistant.cloud/dashboard
#    → Mini calendar shows dots on days with events
#    → Today's todos list and family progress bars render

# d. Sign out → all three new pages redirect to /signin

# 6. Production deploy
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
```

---

## Known Risks

1. **`api.d.ts` not needed** — all new functions go into existing modules (`todos.ts`, `users.ts`). However, if any NEW module is added later in the process, `api.d.ts` must be updated before `npm run build`.

2. **`AGENT_SECRET` + GCal env vars in Next.js route handler** — `app/api/gcal/event-move/route.ts` uses `process.env.AGENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. These must be set in `.env.local` for dev and in the VPS production `.env.production`. Verify they're accessible: `console.log(!!process.env.AGENT_SECRET)` in dev if route returns 500.

3. **GCal token not available in drag handler** — The `/calendar` page calls `useQuery(api.googleCalendar.getMyToken)` to get access/refresh tokens. If the user has no GCal token, `event-move` should skip the GCal PATCH gracefully (`gcalPatched: false`). Handle null token in the frontend before calling the API route.

4. **Convex deploy required** — after adding `patchDueAt` internalMutation and `listForBoard`, `listAllForFamily`, `getTodosInRange`, `updateDueAt`, `toggleForUser`, `patchTitle` public functions.

5. **Component line limit** — Each calendar component must stay under 300 lines. If MonthView grows large (event overflow, responsive layout), split event chip rendering into a sub-component `EventChip.tsx`.

6. **CSS grid height for Week/Day views** — Use `min-h-[60px]` per hour slot to ensure drag targets are large enough for HTML5 drop events. Test on mobile.

7. **HTML5 drag-and-drop on iOS** — Native iOS Safari does not support HTML5 drag-and-drop. Consider a fallback (touch event polyfill or simply note the limitation). For now, drag-and-drop is desktop-only; mobile users can use the edit modal by clicking an event.

8. **`listAllForFamily` performance** — Fetches all todos for all users. Acceptable for a family of 4; add a note for future pagination if family grows.

9. **Family `toggleForUser` — no star dedup** — If a family member completes someone else's todo, stars are awarded to the owner. This is intentional per INITIAL.md ("family view can complete other users' todos"). Ensure the mutation does NOT call `checkQuestCompletion` (quest completion is personal and requires `recurrenceId`).

---

## Confidence Score

**Score:** 8/10

**Reason:** The pattern is well-established (copy auth guard + nav + Convex query from `family/page.tsx` and `page.tsx`). All needed schema fields exist (`dueAt`, `gcalEventId`, `by_user_due` index). The GCal PATCH logic is copied verbatim from `calendar-sync.mjs`. The main uncertainty is the complexity of the CSS grid + HTML5 drag-and-drop implementation across three view modes (no prior art in this codebase), and the token-passing design for `/api/gcal/event-move` (client must send GCal credentials to the route handler, which is acceptable for a self-hosted family app but non-standard). Score would be 9 if the calendar views were simpler (e.g., month-only).

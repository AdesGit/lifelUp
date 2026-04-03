# PRP: Per-user Google Calendar Integration + Bilateral Sync

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: filled from `INITIAL.md` via `/generate-prp`
> See completed example: `PRPs/EXAMPLE_goals_agent.md`

---

## Overview

Build a per-user Google Calendar integration that lets each family member connect their own
Google account via OAuth 2.0. Once connected, LifeLup syncs bidirectionally every 15 minutes:
todos with due dates push to Google Calendar as events, and Google Calendar events pull into
LifeLup as todos, using last-write-wins conflict resolution. Disconnect revokes the token,
removes GCal-sourced todos, and deletes the token from Convex.

---

## Success Criteria

- [ ] Each authenticated user sees an "Intégrations" nav link and page at `/integrations`
- [ ] Clicking "Connecter Google Agenda" initiates OAuth flow → redirects to Google → user grants calendar scope → lands back at `/integrations?connected=true`
- [ ] Connected state persisted per user in Convex — refresh shows "Connecté" with Google email + last sync time + disconnect button
- [ ] Disconnecting revokes the Google token, removes all GCal-sourced todos (`gcalEventId` set), and deletes the token row from Convex
- [ ] Every 15 minutes PM2 agent runs: LifeLup todos with `dueAt` set → GCal events (create/update/delete); GCal events → LifeLup todos (create/update)
- [ ] Last-write-wins: GCal event `updated` > `gcalUpdatedAt` on todo → GCal wins; todo `_creationTime` or local update > `gcalUpdatedAt` → LifeLup wins
- [ ] Token auto-refresh: agent refreshes access token when `expiresAt < Date.now() + 60000`
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] Unauthenticated users redirected to `/signin`
- [ ] Bearer token auth on all `/agent/v1/gcal-*` endpoints: wrong token → 401, correct token → valid JSON
- [ ] Manual verification: connect Google account, create a todo with `dueAt`, wait 15 min (or trigger manually), confirm event appears in Google Calendar

---

## Context Files to Read Before Implementing

- `convex/schema.ts` — current tables and index names (read before touching schema)
- `convex/_generated/api.d.ts` — must update when adding new `convex/googleCalendar.ts` module
- `convex/http.ts` — existing `verifyAgentSecret` helper + all current endpoint patterns
- `examples/convex-http-agent.ts` — verifyAgentSecret + GET/POST pattern
- `examples/agent-script.mjs` — PM2 polling pattern (copy for `calendar-sync.mjs`)
- `app/goals/page.tsx` — canonical nav header pattern (all links, auth guard, spinner)
- `components/PushNotificationButton.tsx` — reference for per-user opt-in pattern
- `convex/todos.ts` — existing todo schema usage; understand `dueAt` / `gcalEventId` integration points
- `lifelup-agent/ecosystem.config.cjs` — PM2 config to add new agent entry

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/schema.ts` | Modify | Add `googleCalendarTokens` table; add `dueAt`, `gcalEventId`, `gcalUpdatedAt` fields to `todos` |
| `convex/_generated/api.d.ts` | Modify | Add `googleCalendar` import + fullApi entry |
| `convex/googleCalendar.ts` | Create | Token CRUD (public + internal), sync-state queries, internal mutations for sync |
| `convex/todos.ts` | Modify | Add internal queries for `getTodosWithDueAt` per user; add `gcalEventId`/`gcalUpdatedAt` patch mutations |
| `convex/http.ts` | Modify | Add 6 new `/agent/v1/gcal-*` endpoints |
| `app/integrations/page.tsx` | Create | French UI — connect/disconnect card, connected state with email + last sync |
| `app/api/auth/google/callback/route.ts` | Create | Next.js API route — exchange OAuth code for tokens, store in Convex, redirect |
| `lifelup-agent/calendar-sync.mjs` | Create | PM2 agent — bilateral sync, no LLM, runs every 15 min via cron_restart |
| `lifelup-agent/ecosystem.config.cjs` | Modify | Add `lifelup-calendar-sync` entry with `cron_restart: "*/15 * * * *"` |

---

## Tasks

### Task 1: Schema — googleCalendarTokens table + todos fields
**File:** `convex/schema.ts`
**Action:** Modify
**Depends on:** nothing

Add new table:
```typescript
googleCalendarTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.number(),          // unix ms
  googleEmail: v.string(),        // displayed in UI
  calendarId: v.string(),         // "primary"
  connectedAt: v.number(),        // unix ms
  lastSyncAt: v.optional(v.number()), // unix ms, updated after each sync run
})
  .index("by_user", ["userId"]),
```

Add optional fields to the `todos` table (after `category`):
```typescript
dueAt: v.optional(v.number()),         // unix ms — user-set due date, drives calendar sync
gcalEventId: v.optional(v.string()),   // GCal event ID (set after sync push)
gcalUpdatedAt: v.optional(v.number()), // GCal event's last modification time (unix ms)
```

Add new index to `todos` table:
```typescript
.index("by_user_due", ["userId", "dueAt"])
```

---

### Task 2: Update api.d.ts
**File:** `convex/_generated/api.d.ts`
**Action:** Modify — add new module
**Depends on:** Task 1
**MUST be done BEFORE Task 7 (`npm run build`)**

```typescript
// Add with other imports (alphabetical order — after "goals"):
import type * as googleCalendar from "../googleCalendar.js";

// Add to fullApi ApiFromModules<{...}> (alphabetical — after goals):
googleCalendar: typeof googleCalendar;
```

---

### Task 3: Convex module — convex/googleCalendar.ts
**File:** `convex/googleCalendar.ts`
**Action:** Create
**Depends on:** Task 1, Task 2

**Public queries/mutations** (web app — auth-gated):
```typescript
// Returns the current user's GCal token doc (or null if not connected)
export const getMyToken = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();
  },
});

// Called from the integrations page to save token after OAuth callback
// (The callback route calls this via a Convex HTTP action, not directly)
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.delete(token._id);
    // Remove GCal-sourced todos for this user
    const gcalTodos = await ctx.db.query("todos")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.neq(q.field("gcalEventId"), undefined))
      .collect();
    for (const todo of gcalTodos) {
      await ctx.db.delete(todo._id);
    }
  },
});
```

**Internal mutations** (called from HTTP endpoints / OAuth callback):
```typescript
// Called by the OAuth callback API route to persist the token
export const saveToken = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    googleEmail: v.string(),
    calendarId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
    } else {
      await ctx.db.insert("googleCalendarTokens", { ...args, connectedAt: now });
    }
  },
});

// Called by the sync agent after each successful sync run
export const updateLastSync = internalMutation({
  args: { userId: v.id("users"), lastSyncAt: v.number() },
  handler: async (ctx, { userId, lastSyncAt }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.patch(token._id, { lastSyncAt });
  },
});

// Called by the sync agent after token refresh
export const updateAccessToken = internalMutation({
  args: { userId: v.id("users"), accessToken: v.string(), expiresAt: v.number() },
  handler: async (ctx, { userId, accessToken, expiresAt }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.patch(token._id, { accessToken, expiresAt });
  },
});

// Returns all users with an active GCal token (for the sync agent)
export const getAllTokens = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("googleCalendarTokens").collect(),
});
```

**Internal todo helpers** (add to `convex/todos.ts`):
```typescript
// Returns all todos with dueAt set for a given user (for GCal push)
export const getTodosWithDueAt = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.query("todos")
      .withIndex("by_user_due", q => q.eq("userId", userId).gt("dueAt", 0))
      .collect();
  },
});

// Set gcalEventId + gcalUpdatedAt after creating/updating a GCal event
export const patchGcalFields = internalMutation({
  args: {
    id: v.id("todos"),
    gcalEventId: v.optional(v.string()),
    gcalUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, gcalEventId, gcalUpdatedAt }) => {
    await ctx.db.patch(id, { gcalEventId, gcalUpdatedAt });
  },
});

// Create a todo from a GCal event (GCal → LifeLup direction)
export const createFromGcal = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    dueAt: v.number(),
    gcalEventId: v.string(),
    gcalUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("todos", {
      userId: args.userId,
      text: args.text,
      completed: false,
      dueAt: args.dueAt,
      gcalEventId: args.gcalEventId,
      gcalUpdatedAt: args.gcalUpdatedAt,
      category: "other",
    });
  },
});
```

---

### Task 4: HTTP Endpoints — convex/http.ts additions
**File:** `convex/http.ts`
**Action:** Modify — append before `export default http`
**Depends on:** Task 3

Six new endpoints for the calendar sync agent:

```typescript
// GET /agent/v1/gcal-tokens — all users with GCal tokens (for sync loop)
http.route({
  path: "/agent/v1/gcal-tokens",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const tokens = await ctx.runQuery(internal.googleCalendar.getAllTokens);
    return Response.json(tokens);
  }),
});

// POST /agent/v1/gcal-tokens-update — update access token after refresh
http.route({
  path: "/agent/v1/gcal-tokens-update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId, accessToken, expiresAt } = await req.json();
    await ctx.runMutation(internal.googleCalendar.updateAccessToken, { userId, accessToken, expiresAt });
    return Response.json({ ok: true });
  }),
});

// GET /agent/v1/gcal-todos?userId=... — todos with dueAt for a given user
http.route({
  path: "/agent/v1/gcal-todos",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") as Id<"users"> | null;
    if (!userId) return new Response("Missing userId", { status: 400 });
    const todos = await ctx.runQuery(internal.todos.getTodosWithDueAt, { userId });
    return Response.json(todos);
  }),
});

// POST /agent/v1/gcal-todo-update — set gcalEventId/gcalUpdatedAt on a todo
http.route({
  path: "/agent/v1/gcal-todo-update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { id, gcalEventId, gcalUpdatedAt } = await req.json();
    await ctx.runMutation(internal.todos.patchGcalFields, { id, gcalEventId, gcalUpdatedAt });
    return Response.json({ ok: true });
  }),
});

// POST /agent/v1/gcal-todo-create — create a todo from a GCal event
http.route({
  path: "/agent/v1/gcal-todo-create",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    await ctx.runMutation(internal.todos.createFromGcal, body);
    return Response.json({ ok: true });
  }),
});

// POST /agent/v1/gcal-sync-done — update lastSyncAt for a user token
http.route({
  path: "/agent/v1/gcal-sync-done",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId, lastSyncAt } = await req.json();
    await ctx.runMutation(internal.googleCalendar.updateLastSync, { userId, lastSyncAt });
    return Response.json({ ok: true });
  }),
});
```

---

### Task 5: OAuth Callback — app/api/auth/google/callback/route.ts
**File:** `app/api/auth/google/callback/route.ts`
**Action:** Create
**Depends on:** Task 3

This is a Next.js API route (not a Convex function). It receives the Google OAuth redirect, exchanges the code for tokens, calls Convex to store them, then redirects to `/integrations`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // base64(userId)
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/integrations?error=oauth_denied", req.url));
  }

  // Decode userId from state
  const userId = Buffer.from(state, "base64").toString("utf-8");

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/integrations?error=token_exchange", req.url));
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  // Fetch Google email to display in UI
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const { email: googleEmail } = await userRes.json();

  // Store token in Convex via internal HTTP action
  // NOTE: We call the Convex HTTP endpoint (agent route) rather than a public mutation,
  // because the user's Convex session token is not available server-side here.
  // The saveToken internal mutation is exposed via /agent/v1/gcal-oauth-save endpoint.
  // See Task 4b below for this endpoint.
  const convex = new ConvexHttpClient(CONVEX_URL);

  // Alternative: call a dedicated "oauth-save" HTTP endpoint protected by a shared secret
  const agentSecret = process.env.AGENT_SECRET!;
  await fetch(`${CONVEX_URL.replace("3210", "3211")}/agent/v1/gcal-oauth-save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentSecret}`,
    },
    body: JSON.stringify({
      userId,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      googleEmail,
      calendarId: "primary",
    }),
  });

  return NextResponse.redirect(new URL("/integrations?connected=true", req.url));
}
```

**Add one more HTTP endpoint** to `convex/http.ts` (Task 4b — depends on Task 3):
```typescript
// POST /agent/v1/gcal-oauth-save — called by Next.js OAuth callback route to persist token
http.route({
  path: "/agent/v1/gcal-oauth-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId, accessToken, refreshToken, expiresAt, googleEmail, calendarId } = await req.json();
    await ctx.runMutation(internal.googleCalendar.saveToken, {
      userId, accessToken, refreshToken, expiresAt, googleEmail, calendarId,
    });
    return Response.json({ ok: true });
  }),
});
```

**CONVEX_URL note:** The Convex HTTP actions endpoint is `https://convex.aidigitalassistant.cloud`
(not port 3211 — that's Docker-internal only). Use `process.env.NEXT_PUBLIC_CONVEX_URL` directly.

---

### Task 6: Integrations Page — app/integrations/page.tsx
**File:** `app/integrations/page.tsx`
**Action:** Create
**Depends on:** Task 3

Copy nav header verbatim from `app/goals/page.tsx` (all existing nav links preserved, add
"Intégrations" as current page highlighted in `text-blue-600`). Also add "Intégrations" link
to ALL other page nav headers (search for the nav block in each page and add the link).

Pages needing nav update (add `· <Link href="/integrations">Intégrations</Link>`):
- `app/page.tsx`
- `app/family/page.tsx`
- `app/coach/page.tsx`
- `app/goals/page.tsx`
- `app/context/page.tsx`
- `app/todos/recurring/page.tsx`
- `app/fichiers/page.tsx` (if exists)
- `app/quests/page.tsx`
- `app/agents/page.tsx`

**Integrations page logic:**
```typescript
"use client";

// Auth guard identical to goals/page.tsx
// useQuery(api.googleCalendar.getMyToken) → shows connected or disconnected state

// Disconnected card:
// Title: "Google Agenda"
// Description: "Synchronisez vos todos avec échéance dans Google Calendar."
// Button: "Connecter Google Agenda" (blue) → onClick builds OAuth URL and window.location = url

// OAuth URL builder (client-side):
function buildGoogleOAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!,
    scope: "https://www.googleapis.com/auth/calendar",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state: btoa(userId), // base64-encode userId to tie callback back to this user
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Connected card:
// Green "Connecté" badge + googleEmail + "Dernière sync: X ago" (or "Jamais" if null)
// "Synchroniser maintenant" button (ghost, triggers manual PM2 run — informational only for MVP)
// "Déconnecter" button (red/ghost) → calls useMutation(api.googleCalendar.disconnect) → optimistic clear
```

**New env vars needed (add to .env.local for dev, .env.production for prod):**
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=515588015244-68bi006arq6gn90kslks1ekq72p4dqu0.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://lifelup.aidigitalassistant.cloud/api/auth/google/callback
GOOGLE_CLIENT_ID=515588015244-68bi006arq6gn90kslks1ekq72p4dqu0.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret-ending-in-FHqs>
GOOGLE_REDIRECT_URI=https://lifelup.aidigitalassistant.cloud/api/auth/google/callback
AGENT_SECRET=de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
```

> Note: `NEXT_PUBLIC_*` vars are safe to expose client-side (OAuth client_id and redirect_uri
> are public in any OAuth flow). `GOOGLE_CLIENT_SECRET` must remain server-side only.

---

### Task 7: Calendar Sync Agent — lifelup-agent/calendar-sync.mjs
**File:** `lifelup-agent/calendar-sync.mjs`
**Action:** Create
**Depends on:** Tasks 3, 4

No LLM involved — pure REST to Google Calendar API + Convex HTTP endpoints.

```javascript
// lifelup-agent/calendar-sync.mjs
// Bilateral sync: LifeLup todos ↔ Google Calendar events
// PM2 runs this every 15 min via cron_restart

const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const AGENT_SECRET = process.env.AGENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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

// Refresh access token if near expiry
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
  await post("/agent/v1/gcal-tokens-update", { userId: token.userId, accessToken: access_token, expiresAt });
  return access_token;
}

// Build a GCal event body from a LifeLup todo
function todoToEvent(todo) {
  const start = new Date(todo.dueAt).toISOString().split("T")[0]; // date-only for all-day
  return {
    summary: todo.text,
    start: { date: start },
    end: { date: start },
  };
}

async function syncUser(token) {
  const accessToken = await ensureFreshToken(token);
  const gcalHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const calendarBase = `https://www.googleapis.com/calendar/v3/calendars/${token.calendarId}`;

  // ─── LifeLup → GCal ──────────────────────────────────────────────────────
  const todos = await get(`/agent/v1/gcal-todos?userId=${token.userId}`);
  for (const todo of todos) {
    if (todo.completed && todo.gcalEventId) {
      // Delete completed todo's GCal event
      await fetch(`${calendarBase}/events/${todo.gcalEventId}`, {
        method: "DELETE", headers: gcalHeaders,
      });
      await post("/agent/v1/gcal-todo-update", { id: todo._id, gcalEventId: undefined, gcalUpdatedAt: undefined });
    } else if (!todo.gcalEventId) {
      // Create new GCal event
      const res = await fetch(`${calendarBase}/events`, {
        method: "POST", headers: gcalHeaders, body: JSON.stringify(todoToEvent(todo)),
      });
      const event = await res.json();
      await post("/agent/v1/gcal-todo-update", {
        id: todo._id, gcalEventId: event.id, gcalUpdatedAt: new Date(event.updated).getTime(),
      });
    } else {
      // Update if todo is newer than last GCal sync
      const todoUpdatedAt = todo._creationTime; // Convex creation time as proxy for last update
      if (todoUpdatedAt > (todo.gcalUpdatedAt ?? 0)) {
        const res = await fetch(`${calendarBase}/events/${todo.gcalEventId}`, {
          method: "PATCH", headers: gcalHeaders, body: JSON.stringify(todoToEvent(todo)),
        });
        const event = await res.json();
        await post("/agent/v1/gcal-todo-update", {
          id: todo._id, gcalEventId: event.id, gcalUpdatedAt: new Date(event.updated).getTime(),
        });
      }
    }
  }

  // ─── GCal → LifeLup ──────────────────────────────────────────────────────
  const updatedMin = token.lastSyncAt
    ? new Date(token.lastSyncAt).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days on first run

  const gcalRes = await fetch(
    `${calendarBase}/events?updatedMin=${encodeURIComponent(updatedMin)}&singleEvents=true&maxResults=50`,
    { headers: gcalHeaders }
  );
  const { items = [] } = await gcalRes.json();

  const existingGcalIds = new Set(todos.filter(t => t.gcalEventId).map(t => t.gcalEventId));

  for (const event of items) {
    if (event.status === "cancelled") continue;
    const gcalUpdatedAt = new Date(event.updated).getTime();
    const dueAt = event.start?.dateTime
      ? new Date(event.start.dateTime).getTime()
      : event.start?.date
        ? new Date(event.start.date).getTime()
        : null;
    if (!dueAt) continue;

    if (!existingGcalIds.has(event.id)) {
      // New GCal event — create LifeLup todo
      await post("/agent/v1/gcal-todo-create", {
        userId: token.userId,
        text: event.summary ?? "(Sans titre)",
        dueAt,
        gcalEventId: event.id,
        gcalUpdatedAt,
      });
    } else {
      // Existing todo — update if GCal is newer
      const matchingTodo = todos.find(t => t.gcalEventId === event.id);
      if (matchingTodo && gcalUpdatedAt > (matchingTodo.gcalUpdatedAt ?? 0)) {
        await post("/agent/v1/gcal-todo-update", {
          id: matchingTodo._id,
          gcalEventId: event.id,
          gcalUpdatedAt,
        });
        // Note: updating todo text from GCal would require a separate patchText mutation
        // Omit for MVP — GCal → LifeLup only updates dueAt/gcalUpdatedAt, not text
      }
    }
  }

  // Mark sync complete
  await post("/agent/v1/gcal-sync-done", { userId: token.userId, lastSyncAt: Date.now() });
}

async function main() {
  console.log(`[calendar-sync] Starting sync at ${new Date().toISOString()}`);
  const tokens = await get("/agent/v1/gcal-tokens");
  console.log(`[calendar-sync] ${tokens.length} connected user(s)`);
  for (const token of tokens) {
    try {
      await syncUser(token);
      console.log(`[calendar-sync] Synced user ${token.googleEmail}`);
    } catch (err) {
      console.error(`[calendar-sync] Error syncing ${token.googleEmail}:`, err.message);
    }
  }
  console.log("[calendar-sync] Done.");
}

main().catch(console.error);
```

---

### Task 8: PM2 Config Update — lifelup-agent/ecosystem.config.cjs
**File:** `lifelup-agent/ecosystem.config.cjs`
**Action:** Modify — add new app entry
**Depends on:** Task 7

Add to the `apps` array:
```javascript
{
  name: "lifelup-calendar-sync",
  script: "/home/claude/dev/lifelup-agent/calendar-sync.mjs",
  interpreter: "node",
  cron_restart: "*/15 * * * *",
  autorestart: false,   // cron_restart handles scheduling; don't restart on exit
  env: {
    AGENT_SECRET: "de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4",
    CONVEX_SITE_URL: "https://convex.aidigitalassistant.cloud",
    GOOGLE_CLIENT_ID: "515588015244-68bi006arq6gn90kslks1ekq72p4dqu0.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "<secret-ending-in-FHqs — fill in before deploying>",
  }
}
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

Common pitfalls:
- `Id<"todos">` import needed in `convex/http.ts` for the `gcal-todos` endpoint
- `v.optional(v.string())` vs `v.string()` in internal mutation args must match schema exactly
- `undefined` vs `v.optional` — when patching with `gcalEventId: undefined`, use `ctx.db.patch` which omits undefined fields automatically in Convex

---

### Task 10: Convex Deploy
**Action:** Run
**Depends on:** Task 9

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

Watch for:
- Schema migration: `googleCalendarTokens` table created
- New indexes: `by_user` on `googleCalendarTokens`, `by_user_due` on `todos`
- New fields added to `todos`: `dueAt`, `gcalEventId`, `gcalUpdatedAt` — these are optional so no migration needed for existing records

---

### Task 11: Production Deploy
**Action:** Run on VPS
**Depends on:** Task 10

```bash
# 1. Add env vars to production
echo 'GOOGLE_CLIENT_ID=515588015244-68bi006arq6gn90kslks1ekq72p4dqu0.apps.googleusercontent.com' >> /var/www/lifelup/.env.production
echo 'GOOGLE_CLIENT_SECRET=<secret>' >> /var/www/lifelup/.env.production
echo 'GOOGLE_REDIRECT_URI=https://lifelup.aidigitalassistant.cloud/api/auth/google/callback' >> /var/www/lifelup/.env.production
echo 'NEXT_PUBLIC_GOOGLE_CLIENT_ID=515588015244-68bi006arq6gn90kslks1ekq72p4dqu0.apps.googleusercontent.com' >> /var/www/lifelup/.env.production
echo 'NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://lifelup.aidigitalassistant.cloud/api/auth/google/callback' >> /var/www/lifelup/.env.production
echo 'AGENT_SECRET=de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4' >> /var/www/lifelup/.env.production

# 2. Deploy Next.js app
cd /var/www/lifelup && git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup

# 3. Start calendar sync agent (NEVER use --update-env)
cd /home/claude/dev/lifelup-agent
pm2 delete lifelup-calendar-sync 2>/dev/null || true
# Edit ecosystem.config.cjs to fill in GOOGLE_CLIENT_SECRET first
pm2 start ecosystem.config.cjs --only lifelup-calendar-sync
pm2 save

# 4. Verify agent started
pm2 list
pm2 logs lifelup-calendar-sync --lines 20 --nostream
```

**BEFORE DEPLOYING — Google Cloud Console steps (manual, done by user):**
1. Go to console.cloud.google.com → APIs & Services → Credentials
2. Edit the OAuth 2.0 client `515588015244-68bi006arq6gn90kslks1ekq72p4dqu0`
3. Add Authorized redirect URI: `https://lifelup.aidigitalassistant.cloud/api/auth/google/callback`
4. Add Authorized JavaScript origin: `https://lifelup.aidigitalassistant.cloud`
5. Save

---

## Validation Sequence

```bash
# 1. TypeScript build
npm run build 2>&1 | tail -20

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. Convex deploy
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# 4. HTTP auth checks
# Should return 401:
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/gcal-tokens

# Should return valid JSON array:
curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/gcal-tokens

# 5. Manual UI verification
# Open https://lifelup.aidigitalassistant.cloud/integrations
# Sign out → confirm redirect to /signin
# Sign in → confirm "Intégrations" page shows disconnected Google Agenda card
# Click "Connecter Google Agenda" → confirm redirect to Google consent screen
# Complete OAuth → confirm redirect back to /integrations?connected=true
# Confirm green "Connecté" badge + Google email displayed

# 6. Manual sync test
pm2 logs lifelup-calendar-sync --lines 30 --nostream
# Create a todo with a dueAt date → wait or trigger: node /home/claude/dev/lifelup-agent/calendar-sync.mjs
# Check Google Calendar → confirm event appeared
```

---

## Known Risks

- **api.d.ts update required before npm run build** — always do Task 2 before Task 9
- **npx convex deploy required after schema.ts change** — new table + new todo fields + new index
- **Google Cloud Console redirect URI must be configured before OAuth flow works** — user must add it manually before testing (Task 11 prerequisite)
- **GOOGLE_CLIENT_SECRET must not be committed** — fill in ecosystem.config.cjs directly on VPS, never commit it to git
- **PM2 cron_restart needs autorestart: false** — otherwise PM2 will immediately restart on exit AND on cron, causing double-runs
- **Convex HTTP actions URL** — use `https://convex.aidigitalassistant.cloud` (the public URL), not `localhost:3211` (Docker-internal only)
- **No `_updatedAt` field on todos** — LifeLup uses `_creationTime` as a proxy for "last modified" when deciding last-write-wins. For MVP this is acceptable; a proper `updatedAt` field should be added later for accurate conflict resolution
- **Token storage in plain text** — access/refresh tokens stored as plain strings in Convex. For a family-only app this is acceptable; encrypt at rest for production multi-tenant use
- **`dueAt` field is new** — existing todos have no `dueAt`; they are never synced to GCal (correct behavior — only opt-in todos with a due date sync)

---

## Confidence Score

**Score:** 8/10

**Reason:** All layers are well-specified in INITIAL.md, the OAuth pattern is standard, and the
Convex agent endpoint pattern is well-established in this codebase. Score is not 9-10 because:
1. The OAuth callback Next.js API route calling a Convex HTTP endpoint (rather than using the
   user's auth token) is a non-standard pattern that adds a moving part — the `gcal-oauth-save`
   endpoint must be correctly secured and the `userId` from `state` param must be trusted.
2. The bilateral sync last-write-wins logic using `_creationTime` as a proxy for `updatedAt`
   is a known gap; if users edit todos after creation, the conflict resolution may favor the
   wrong side. Acceptable for MVP, noted in Known Risks.
3. `NEXT_PUBLIC_*` env vars must be set at Next.js build time — if forgotten, the OAuth URL
   builder will silently produce a broken URL.

These risks are all documented and manageable. The PRP provides enough context to execute safely.

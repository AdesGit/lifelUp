# PRP: Goals Extraction Agent (COMPLETED EXAMPLE)

> **This is a COMPLETED PRP** — the goals extraction feature shipped in commit `0a6d728`.
> Use it as the canonical reference for what a filled-out, executed PRP looks like.
> Template for future PRPs: `PRPs/templates/prp_lifelup.md`

---

## Overview
Extract medium and long-term personal goals from each user's coach conversation history using an LLM. Store goals per user with progress tracking, evidence quotes, and suggested next actions. Refresh daily via a scheduled RemoteTrigger. Display on a `/goals` page grouped by category.

---

## Success Criteria (all completed)
- [x] `/goals` page shows active goals grouped by category with progress bars
- [x] Unauthenticated users redirected to `/signin`
- [x] `npm run build` passes (zero TypeScript errors)
- [x] `npm run lint` passes (zero warnings)
- [x] Bearer token auth: wrong token → 401 on all `/agent/v1/goals-*` endpoints
- [x] `by_user_fingerprint` compound index prevents duplicate goals across daily runs
- [x] Goals agent runs daily at midnight UTC and updates goals without creating duplicates
- [x] Goals appear automatically after coach conversations — no manual trigger needed

---

## Context Files Read Before Implementing
- `convex/schema.ts` — checked existing tables, index patterns
- `convex/_generated/api.d.ts` — studied import + fullApi pattern
- `convex/context.ts` — primary reference (similar family-wide agent pattern)
- `convex/http.ts` — understood verifyAgentSecret + existing endpoint structure
- `app/context/page.tsx` — studied nav header pattern to match

---

## Affected Files (all shipped)

| File | Action | Result |
|------|--------|--------|
| `convex/schema.ts` | Modified | Added `goals` table with 9 fields + 2 indexes |
| `convex/_generated/api.d.ts` | Modified | Added `goals` import + fullApi entry |
| `convex/goals.ts` | Created | 5 functions: 1 public query + 4 internal |
| `convex/http.ts` | Modified | Added GET `/agent/v1/goals-work`, POST `/agent/v1/goals-save` |
| `app/goals/page.tsx` | Created | Protected page with category cards and progress bars |

---

## Implementation: Schema

```typescript
// convex/schema.ts — added to defineSchema({...})
goals: defineTable({
  userId: v.id("users"),
  title: v.string(),
  category: v.union(
    v.literal("health"), v.literal("career"), v.literal("learning"),
    v.literal("family"), v.literal("finance"), v.literal("personal"),
  ),
  horizon: v.union(v.literal("medium"), v.literal("long")),
  progress: v.number(),              // 0–100, LLM-estimated
  evidence: v.array(v.string()),     // verbatim quotes from conversations
  nextActions: v.array(v.string()),  // LLM-suggested next steps
  status: v.union(v.literal("active"), v.literal("achieved"), v.literal("dropped")),
  fingerprint: v.string(),           // "category:slug" — deduplication key
  extractedAt: v.number(),           // timestamp of last extraction
})
  .index("by_user", ["userId"])
  .index("by_user_fingerprint", ["userId", "fingerprint"]),
  // Compound index: efficient per-user upsert lookup without full table scan
```

---

## Implementation: api.d.ts Update

```typescript
// Added import:
import type * as goals from "../goals.js";

// Added to fullApi ApiFromModules<{...}>:
goals: typeof goals;
```

---

## Implementation: Convex Module (convex/goals.ts)

**Public query** (web app):
```typescript
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db.query("goals").withIndex("by_user", q => q.eq("userId", userId)).order("desc").collect();
  },
});
```

**Internal queries** (agent only — not callable from frontend):
```typescript
// Returns all users who have at least one agentMessage
export const getUsersWithHistory = internalQuery({ ... });

// Returns all messages for a user across all sessions, chronological
export const getAllMessagesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => { ... },
});

// Returns existing goals for a user (agent merges against these)
export const getGoalsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => { ... },
});
```

**Internal mutation** (upsert-by-fingerprint):
```typescript
export const upsertGoal = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    category: categoryValidator,
    horizon: v.union(v.literal("medium"), v.literal("long")),
    progress: v.number(),
    evidence: v.array(v.string()),
    nextActions: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("achieved"), v.literal("dropped")),
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_user_fingerprint", q => q.eq("userId", args.userId).eq("fingerprint", args.fingerprint))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, extractedAt: now });
    } else {
      await ctx.db.insert("goals", { ...args, extractedAt: now });
    }
  },
});
```

---

## Implementation: HTTP Endpoints (convex/http.ts additions)

```typescript
// GET /agent/v1/goals-work — returns all users + their histories + existing goals
http.route({
  path: "/agent/v1/goals-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const users = await ctx.runQuery(internal.goals.getUsersWithHistory);
    const work = await Promise.all(
      users.map(async (user) => {
        const [messages, existingGoals] = await Promise.all([
          ctx.runQuery(internal.goals.getAllMessagesForUser, { userId: user._id }),
          ctx.runQuery(internal.goals.getGoalsForUser, { userId: user._id }),
        ]);
        return {
          userId: user._id,
          userEmail: user.email ?? "unknown",
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          existingGoals,
        };
      })
    );
    return Response.json(work);
  }),
});

// POST /agent/v1/goals-save — upsert extracted goals for one user
http.route({
  path: "/agent/v1/goals-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { userId, goals } = await req.json();
    for (const goal of goals) {
      await ctx.runMutation(internal.goals.upsertGoal, { userId, ...goal });
    }
    return Response.json({ ok: true, saved: goals.length });
  }),
});
```

---

## Implementation: RemoteTrigger (scheduled agent)

- **ID**: `trig_01DaqJv1vsw4EfKR9UQgmaAV`
- **Schedule**: `0 0 * * *` (daily midnight UTC)
- **Model**: `claude-sonnet-4-6` (sonnet for extraction quality vs haiku for coach speed)
- **Flow**: `GET /goals-work` → LLM extraction per user → `POST /goals-save` per user
- **Fingerprint strategy**: `"category:slug"` where slug = lowercased, hyphenated title, max 60 chars

---

## Key Decisions Made

**Why `internalQuery`/`internalMutation` for agent functions?**
HTTP actions don't have a user auth context. Using `internal.*` explicitly marks these as not part of the public API surface. If you used `api.*`, you'd get a Convex type error anyway.

**Why compound index `by_user_fingerprint` instead of just `by_fingerprint`?**
Goals are per-user. A compound index allows: "find this specific goal for this specific user" in O(log n) without a full table scan. A single-field `by_fingerprint` index would require post-filtering by userId.

**Why `claude-sonnet-4-6` instead of `claude-haiku-4-5` for extraction?**
The goals extraction prompt is complex (analyze full conversation history, identify patterns, estimate progress, generate next actions). Sonnet produces meaningfully better structured output. Haiku is fast enough for real-time coach replies but not the right tradeoff for a daily batch job.

**Why store `evidence` as an array of strings?**
Direct quotes from conversations give users confidence the AI "saw" their actual words. Avoids the black-box feeling of auto-generated goals.

---

## Validation Results (at time of shipping)

- `npm run build`: PASS
- `npm run lint`: PASS
- `npx convex deploy`: PASS (added `goals` table + 2 indexes)
- HTTP auth check (wrong token): 401 ✓
- HTTP auth check (correct token): valid JSON array ✓
- Duplicate prevention: ran agent twice, record count unchanged ✓
- Manual verification: `/goals` loads, shows goals by category, redirects unauthenticated users ✓

---

## Confidence Score at PRP Generation
**Score:** 9/10
**Reason:** Pattern was well-established from `context.ts`. Only novel parts were the multi-user fan-out in `goals-work` and the compound index design.

# PRP: [Feature Name]

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: filled from `INITIAL.md` via `/generate-prp`
> See completed example: `PRPs/EXAMPLE_goals_agent.md`

---

## Overview
<!-- 1-2 sentences: what this builds and why -->


---

## Success Criteria
<!-- All must be checkable before marking the feature done -->
- [ ] [Specific user-visible behavior]
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero warnings)
- [ ] Unauthenticated users redirected to `/signin`
- [ ] [If new HTTP endpoint] Bearer token auth: wrong token → 401, correct token → valid JSON
- [ ] [If agent-writable table] Repeated agent runs do not create duplicate records (fingerprint upsert)
- [ ] Manual verification: visit `https://lifelup.aidigitalassistant.cloud/[route]` and confirm [specific action]

---

## Context Files to Read Before Implementing
<!-- Claude Code must read these before writing a single line of code -->
- `convex/schema.ts` — current tables and index names
- `convex/_generated/api.d.ts` — must update when adding new modules
- `examples/convex-mutation.ts` — CRUD pattern (query + mutation + internalMutation upsert)
- `examples/app-page.tsx` — protected page skeleton with exact nav header
- [If HTTP endpoints needed] `examples/convex-http-agent.ts` — verifyAgentSecret + GET/POST pattern
- [If polling agent needed] `examples/agent-script.mjs` — PM2 polling pattern
- [Most similar existing feature, e.g.:] `convex/goals.ts` + `app/goals/page.tsx`

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/schema.ts` | Modify | Add `[tableName]` table |
| `convex/_generated/api.d.ts` | Modify | Add import + fullApi entry for new module |
| `convex/[module].ts` | Create | Public queries/mutations + internal agent functions |
| `convex/http.ts` | Modify | Add GET + POST endpoints under `/agent/v1/` |
| `app/[route]/page.tsx` | Create | Protected page |
| `components/[Name].tsx` | Create | (if reusable component needed) |

---

## Tasks

### Task 1: Schema
**File:** `convex/schema.ts`
**Action:** Modify — add new table
**Depends on:** nothing

```typescript
[tableName]: defineTable({
  // Required for all user-owned tables:
  userId: v.id("users"),

  // Feature-specific fields:
  [field]: v.[type](),

  // Required for all agent-writable tables:
  fingerprint: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_fingerprint", ["userId", "fingerprint"]),
  // Use by_fingerprint (no userId) for family-wide tables
```

---

### Task 2: Update api.d.ts
**File:** `convex/_generated/api.d.ts`
**Action:** Modify — add new module
**Depends on:** Task 1
**⚠️ Must be done BEFORE Task 6 (npm run build)**

```typescript
// Add at top with other imports:
import type * as [module] from "../[module].js";

// Add to fullApi ApiFromModules<{...}>:
[module]: typeof [module];
```

---

### Task 3: Convex Module
**File:** `convex/[module].ts`
**Action:** Create
**Depends on:** Task 1, Task 2

Public functions (web app):
```typescript
// Auth-gated query — returns data for current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db.query("[tableName]").withIndex("by_user", q => q.eq("userId", userId)).collect();
  },
});
```

Internal functions (agent only — never callable from frontend):
```typescript
// Agent read — no auth required
export const getAll[Items] = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("[tableName]").collect(),
});

// Agent write — upsert by fingerprint to prevent duplicates
export const upsert[Item] = internalMutation({
  args: {
    fingerprint: v.string(),
    // ...other fields
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("[tableName]")
      .withIndex("by_user_fingerprint", q => q.eq("userId", args.userId).eq("fingerprint", args.fingerprint))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("[tableName]", { ...args, createdAt: now, updatedAt: now });
    }
  },
});
```

---

### Task 4: HTTP Endpoints
**File:** `convex/http.ts`
**Action:** Modify — add agent endpoints
**Depends on:** Task 3

```typescript
// GET /agent/v1/[resource] — fetch data for agent to process
http.route({
  path: "/agent/v1/[resource]",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const data = await ctx.runQuery(internal.[module].getAll[Items]);
    return Response.json(data);
  }),
});

// POST /agent/v1/[resource]-save — save agent results
http.route({
  path: "/agent/v1/[resource]-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { items } = await req.json();
    for (const item of items) {
      await ctx.runMutation(internal.[module].upsert[Item], item);
    }
    return Response.json({ ok: true, saved: items.length });
  }),
});
```

---

### Task 5: Page
**File:** `app/[route]/page.tsx`
**Action:** Create
**Depends on:** Task 3

Copy the auth guard + nav header pattern verbatim from `app/goals/page.tsx`:
- `"use client"` + `useConvexAuth()` + `useEffect` redirect to `/signin`
- Loading spinner: `h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent`
- Nav header with all 5 links (My todos · Family · Coach · Goals · Context), current page in `text-blue-600`
- `useQuery(api.[module].list)` for data

---

### Task 6: Build Validation
**Action:** Run
**Depends on:** Tasks 1-5

```bash
npm run build
npm run lint
```

Fix any TypeScript or lint errors before proceeding to Task 7.

---

### Task 7: Convex Deploy
**Action:** Run
**Depends on:** Task 6

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy
```

Watch for: added indexes, schema validation errors.

---

## Validation Sequence

```bash
# 1. TypeScript build
npm run build 2>&1 | tail -20

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. Convex deploy
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy

# 4. (If new HTTP endpoint) Bearer token auth check
# Must return 401:
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/[endpoint]

# Must return valid JSON:
curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/[endpoint]

# 5. Manual verification
# Open https://lifelup.aidigitalassistant.cloud/[route]
# Sign out → confirm redirect to /signin
# Sign in → confirm page loads with correct data

# 6. Production deploy
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
```

---

## Known Risks
<!-- Specific to this feature — fill in during /generate-prp -->
- Always: `api.d.ts` update required before `npm run build` when adding a new module
- Always: `npx convex deploy` required after any `schema.ts` change
- [Feature-specific risks here]

---

## Confidence Score
<!-- Rate 1-10 after /generate-prp fills this in. Score < 7 = clarify INITIAL.md before executing. -->
**Score:** [1-10]
**Reason:** [What would raise or lower this score]

---
description: Execute a LifeLup PRP — implement, validate, and deploy
argument-hint: <path-to-prp.md>
---

# Execute PRP: $ARGUMENTS

Implement the feature described in `$ARGUMENTS`. Follow tasks in dependency order. Validate at each step.

## Step 1: Read and Understand

Read `$ARGUMENTS` completely. From the PRP, extract:
- All tasks and their `depends-on` relationships (execution order)
- "Context Files to Read Before Implementing" list
- "Validation Sequence" commands
- All task code skeletons and field names

Do NOT start coding until you have read the PRP fully.

## Step 2: Read All Context Files

Read every file listed in the PRP's "Context Files to Read Before Implementing" section.
Then read every file listed in the "Affected Files" table (to understand their current state before editing).

This is non-negotiable — implementing without reading existing code causes mismatches.

## Step 3: Verify Git State

Run: `git status`

If there are unrelated uncommitted changes, tell the user before proceeding.
Stash or commit them first to keep the diff clean.

## Step 4: Execute Tasks in Dependency Order

Work through each task in the PRP's task list. Respect `depends-on` — do not run Task 3 before Task 2.

### LifeLup-specific rules during implementation:

**Convex schema (Task 1):**
- Spread `authTables` first, then app tables
- Every agent-writable table MUST have `fingerprint: v.string()` field
- Use `by_{field}` naming for indexes, `by_{field1}_{field2}` for compound
- Never guess index names — use exactly what the PRP specifies

**api.d.ts update (Task 2) — ALWAYS before build:**
- Add `import type * as [module] from "../[module].js";` with the other imports
- Add `[module]: typeof [module];` to the `ApiFromModules<{...}>` object
- Do NOT skip this step — `npm run build` will fail with cryptic TS errors if you do
- Check current `_generated/api.d.ts` first to understand the exact format

**Convex module (Task 3):**
- Validate every arg with `v.*` — no unvalidated inputs
- Public `query`/`mutation`: always call `getAuthUserId(ctx)` and check it
- `internalQuery`/`internalMutation`: no auth check (intentional — agent access only)
- `internalMutation` upsert: use compound index lookup, patch if found, insert if not

**HTTP endpoints (Task 4):**
- FIRST LINE of every handler: `if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });`
- Use `ctx.runQuery(internal.module.fn)` — NEVER `ctx.runQuery(api.module.fn)`
- Use `ctx.runMutation(internal.module.fn)` — NEVER `ctx.runMutation(api.module.fn)`
- Loop serially for saves (not `Promise.all`) to avoid DB contention

**Page (Task 5):**
- `"use client"` directive — always
- Copy nav header verbatim from `app/goals/page.tsx` — update only the active item
- `useEffect` redirect to `/signin` when `!isLoading && !isAuthenticated`
- Show spinner while `isLoading || !isAuthenticated` — never show content during load
- `useQuery(api.[module].list)` — `undefined` = loading, empty array = loaded but empty

After each task, run `npm run build 2>&1 | tail -20` if TypeScript was changed.
Fix errors immediately — do not accumulate errors across tasks.

## Step 5: Run Full Validation Sequence

Execute every command from the PRP's "Validation Sequence" section in order:

```bash
# Build
npm run build 2>&1 | tail -20

# Lint
npm run lint 2>&1 | tail -10

# Convex deploy (if schema or functions changed)
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# Bearer token auth (if new HTTP endpoints)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/[endpoint]
# Expected: 401

curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/[endpoint]
# Expected: valid JSON
```

Do NOT proceed to Step 6 if any validation fails. Fix it first.

## Step 6: Manual Verification

Open `https://lifelup.aidigitalassistant.cloud/[route]` in a browser (or curl for status code).

Verify the specific criteria from the PRP success checklist:
- Unauthenticated: visit URL → should redirect to `/signin`
- Authenticated: page loads, shows correct data, no console errors
- [Feature-specific checks from PRP]

## Step 7: Production Deploy

After all validation passes:

```bash
# Push code changes
git add [specific files — never git add -A]
git commit -m "feat([scope]): [description]"
git push origin main

# Deploy to production app
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
pm2 save

# If Convex schema changed, it was already deployed in Step 5.
# No second Convex deploy needed.

# If PM2 agent script changed:
# pm2 delete lifelup-coach
# pm2 start /home/claude/dev/lifelup-agent/ecosystem.config.cjs
# pm2 save
```

## Step 8: Execution Report

Output a structured report:

```
## Execution Report: {PRP Name}

### Tasks Completed
- [x] Task 1: Schema — added `[tableName]` table
- [x] Task 2: api.d.ts — added `[module]` import
- [x] Task 3: convex/[module].ts — created N functions
- [x] Task 4: convex/http.ts — added GET + POST endpoints
- [x] Task 5: app/[route]/page.tsx — created protected page

### Files Created/Modified
- `convex/schema.ts` — added [tableName] table with N fields + 2 indexes
- `convex/_generated/api.d.ts` — added [module] import
- `convex/[module].ts` — [N] functions: list (public), upsert[Item] (internal), ...
- `convex/http.ts` — added /agent/v1/[resource] GET and POST
- `app/[route]/page.tsx` — protected page with [description]

### Validation Results
- build: PASS
- lint: PASS
- convex deploy: PASS (added N functions, N indexes)
- HTTP auth (wrong token): 401 ✓
- HTTP auth (correct token): valid JSON ✓
- Manual verification: [what was tested and observed]

### Production Deploy
- [x] git push origin main
- [x] /var/www/lifelup npm run build + pm2 restart lifelup

### Deviations from PRP
[Any decisions made that differed from the PRP, and why]
```

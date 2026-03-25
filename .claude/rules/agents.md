---
paths:
  - "convex/coach.ts"
  - "convex/goals.ts"
  - "convex/context.ts"
  - "convex/http.ts"
---

# AI Agent Architecture

## Overview

LifeLup uses a hybrid agent architecture:
- **Real-time coach replies**: PM2 polling process (`lifelup-coach`) — polls every 15s, replies within ~15 seconds
- **Daily/weekly batch jobs**: RemoteTrigger (Anthropic Cloud) — goal extraction, context extraction

## HTTP Agent Endpoints (`convex/http.ts`)

All endpoints under `/agent/v1/*` are protected by Bearer token:
```
Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
```

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/agent/v1/pending` | Returns sessions where last msg is from user (< 10 min old) |
| POST | `/agent/v1/reply` | Save coach's reply: `{ sessionId, userId, content }` |
| GET | `/agent/v1/goals-work` | All users + their conversation history + existing goals |
| POST | `/agent/v1/goals-save` | Upsert goals for one user: `{ userId, goals: [...] }` |
| GET | `/agent/v1/context` | All family context entries |
| POST | `/agent/v1/context-save` | Upsert context entries: `{ entries: [...] }` |

These route to port 3211 (Convex HTTP actions) via Nginx. Port 3210 is the sync engine (WebSocket).

## Coach Polling Agent

**Location**: `/home/claude/dev/lifelup-agent/coach-poll.mjs`
**PM2 process**: `lifelup-coach` (id=2)
**API key**: OAuth token from `~/.claude/.credentials.json` (Claude Code's own token, `user:inference` scope)

Each poll:
1. `GET /agent/v1/pending` → list of sessions needing a reply
2. For each session: call Anthropic API (claude-haiku-4-5) with system prompt containing:
   - User's email
   - Current todo list
   - **Family context entries** (from `context` field — injected by `getPendingSessions`)
   - Full conversation history
3. `POST /agent/v1/reply` → save the response

The `context` field is populated by `getPendingSessions` in `convex/coach.ts` — it queries all `contextEntries` and includes them in the payload. This means context entries are instantly available to the coach without restarting anything.

## Goals Extraction Agent (RemoteTrigger)

**ID**: `trig_01DaqJv1vsw4EfKR9UQgmaAV`
**Schedule**: Daily at midnight UTC (`0 0 * * *`)
**Model**: claude-sonnet-4-6

Flow: fetch `/agent/v1/goals-work` → analyze per user with LLM → `POST /agent/v1/goals-save` per user

Goals use fingerprint `"category:slug"` for upserts. The `by_user_fingerprint` index in Convex prevents duplicates across daily runs.

## Context Extraction Agent (RemoteTrigger)

**ID**: `trig_018kynNqXtsXR8bwLQNXF7rV`
**Schedule**: Weekly Sunday at 2am UTC (`0 2 * * 0`)
**Model**: claude-sonnet-4-6

Flow: fetch `/agent/v1/goals-work` (conversations) + `/agent/v1/context` (existing entries) → extract family-wide facts → `POST /agent/v1/context-save`

Context is family-wide (no `userId`). Fingerprint uses `"category:slugified-title"` and the `by_fingerprint` index for upserts.

## Adding New Convex Backend for an Agent

Pattern from `goals.ts` / `context.ts`:
1. Add table to `schema.ts` with `fingerprint` + `index("by_fingerprint", ["fingerprint"])`
2. Create `convex/newmodule.ts` with:
   - Public `query`/`mutation` for web app
   - `internalQuery` for agent reads
   - `internalMutation` with upsert-by-fingerprint for agent writes
3. Add HTTP routes in `http.ts` (GET fetch-work, POST save)
4. Add `import type * as newmodule from "../newmodule.js"` + entry to `fullApi` in `_generated/api.d.ts`
5. Run `npx convex deploy` (regenerates bindings, validates schema)
6. If needed: add RemoteTrigger at https://claude.ai/code/scheduled

## Convex `_generated/api.d.ts` — Manual Maintenance

Convex regenerates this file server-side during deploy, but the local copy (committed to git) must be updated manually **before** `npm run build` to avoid TypeScript errors.

When adding a new `convex/foo.ts` module:
```typescript
// Add import:
import type * as foo from "../foo.js";

// Add to fullApi:
declare const fullApi: ApiFromModules<{
  // ...existing...
  foo: typeof foo;
}>;
```

## Success Criteria (for any new agent feature)

Before considering an agent feature complete, verify all of these:
- [ ] HTTP endpoints return `401` for wrong Bearer token (test with curl)
- [ ] HTTP endpoints return valid JSON for correct Bearer token
- [ ] Upsert-by-fingerprint prevents duplicate records on repeated agent runs
- [ ] Agent logs each poll cycle, each reply sent, each per-session error
- [ ] PM2 process env survives delete+start cycle (ANTHROPIC_API_KEY still set after restart)
- [ ] New context entries appear in next coach poll payload without restarting anything
- [ ] `npm run build` passes after adding new Convex module + api.d.ts update
- [ ] `npx convex deploy` passes with no schema errors

## Anti-Patterns

- **Never** call Convex public mutations from agent HTTP scripts — use the `/agent/v1/*` HTTP endpoints
- **Never** put `AGENT_SECRET` in frontend code — it's a server-side secret for HTTP actions only
- **Never** add agent-writable tables without fingerprint field + upsert-by-fingerprint pattern
- **Never** use `pm2 restart --update-env` on the coach agent — silently wipes ANTHROPIC_API_KEY
- **Never** skip updating `api.d.ts` when adding a new convex module — build fails with cryptic TS errors
- **Never** use `api.*` inside `httpAction` handlers — always use `internal.*`

## Validation Gates

After implementing a new agent HTTP endpoint, run:
```bash
# Must return 401
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/<new-endpoint>

# Must return valid JSON
curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/<new-endpoint>

# Schema must validate
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy

# Coach poll must run clean
pm2 logs lifelup-coach --lines 30 --nostream
```

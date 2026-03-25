---
paths:
  - "convex/coach.ts"
  - "convex/goals.ts"
  - "convex/context.ts"
  - "convex/http.ts"
  - "convex/todos.ts"
  - "convex/quests.ts"
  - "convex/recurringTodos.ts"
---

# AI Agent Architecture

## Overview

LifeLup uses a **two-runner hybrid** agent architecture:

| Runner | Use case | Examples |
|--------|----------|---------|
| **PM2 polling** | Time-critical, always-on, no LLM or cheap LLM | coach, star-evaluator, notif-sender |
| **Claude Code `/schedule`** | Batch jobs, LLM reasoning, weekly/daily crons | goals, context, quests, recurring-spawn |

**The preferred approach for new agents is Claude Code `/schedule`** — no extra process to manage,
no credential rotation, Claude Code itself calls the HTTP endpoints and reasons about the work.

Use PM2 only when sub-minute latency is required (coach replies, push notifications).

## Claude Code Async Patterns

### `/loop` — poll during a live session
```
/loop 5m GET /agent/v1/todos-unevaluated and rate any unrated todos with star values
```
Repeats the prompt every 5 minutes within the current Claude Code session.
**Not persistent** — stops when the session ends. Good for manual monitoring or dev-time polling.

### `/schedule` — persistent cron (RemoteTrigger)
```
/schedule "0 7 * * 1" generate weekly quests via GET /agent/v1/quests-work then POST /agent/v1/quests-save
```
Creates a RemoteTrigger that runs a new Claude Code session on the given cron schedule.
**Persistent** — survives session restarts, runs in the background automatically.
Manage existing triggers via `/schedule` skill (list, edit, delete).

Both patterns call the same `/agent/v1/*` HTTP endpoints — the runner is interchangeable.

## HTTP Agent Endpoints (`convex/http.ts`)

All endpoints under `/agent/v1/*` are protected by Bearer token:
```
Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
```

| Method | Path | Runner | Purpose |
|--------|------|--------|---------|
| GET | `/agent/v1/pending` | PM2 coach-poll | Coach sessions needing reply |
| POST | `/agent/v1/reply` | PM2 coach-poll | Save coach reply |
| GET | `/agent/v1/goals-work` | `/schedule` | Users + history + existing goals |
| POST | `/agent/v1/goals-save` | `/schedule` | Upsert goals for one user |
| GET | `/agent/v1/context` | `/schedule` | All family context entries |
| POST | `/agent/v1/context-save` | `/schedule` | Upsert context entries |
| GET | `/agent/v1/recurring-work` | `/schedule` | Templates needing a new spawn |
| POST | `/agent/v1/recurring-spawn` | `/schedule` | Spawn one todo from template |
| GET | `/agent/v1/todos-unevaluated` | PM2 star-evaluator | Todos/templates without starValue |
| POST | `/agent/v1/todos-star` | PM2 star-evaluator | Set star values in batch |
| GET | `/agent/v1/quests-work` | `/schedule` | Users + recurring todos for quest AI |
| POST | `/agent/v1/quests-save` | `/schedule` | Upsert AI-generated quests |
| GET | `/agent/v1/notify-due` | PM2 notif-sender | Recurring todos with nextDueAt ≤ now |
| POST | `/agent/v1/notify-reset` | PM2 notif-sender | Reset todo + advance nextDueAt |

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

## PM2 Agents (always-on)

### Coach polling (`lifelup-coach`, id=2)
**Script**: `/home/claude/dev/lifelup-agent/coach-poll.mjs`
**Interval**: 15 seconds · **Model**: claude-haiku-4-5

Each poll: `GET /pending` → for each session call Anthropic with user email + todos + context entries + history → `POST /reply`.
The `context` field is injected by `getPendingSessions` — context entries are live without restarts.

### Star evaluator (`lifelup-star-evaluator`, id=3)
**Script**: `/home/claude/dev/lifelup-agent/star-evaluator.mjs`
**Interval**: 5 minutes · **Model**: claude-haiku-4-5 · **Batch size**: 20

Polls `GET /todos-unevaluated` → batches unrated todos + recurring templates → rates 1–5 with Haiku → `POST /todos-star`.
Requires valid `ANTHROPIC_API_KEY` in ecosystem.config.cjs.

### Notification sender (`lifelup-notif`, id=4)
**Script**: `/home/claude/dev/lifelup-agent/notification-sender.mjs`
**Interval**: 1 minute · **No LLM** · **Uses**: `web-push` npm package

Polls `GET /notify-due` → sends Web Push to subscribed devices via VAPID → `POST /notify-reset` (resets todo, advances nextDueAt).
Requires `VAPID_PRIVATE_KEY` in ecosystem.config.cjs.

## Claude Code `/schedule` Agents (RemoteTrigger)

### Goals extraction
**Cron**: `0 0 * * *` (daily midnight UTC) · **Model**: claude-sonnet-4-6

Flow: `GET /goals-work` → analyze per user → `POST /goals-save` per user.
Goals use fingerprint `"category:slug"` + `by_user_fingerprint` index for upserts.

### Context extraction
**Cron**: `0 2 * * 0` (Sunday 02:00 UTC) · **Model**: claude-sonnet-4-6

Flow: `GET /context` (existing entries) + conversations → extract family-wide facts → `POST /context-save`.
Fingerprint: `"category:slugified-title"`, family-wide (no userId).

### Recurring spawn
**Cron**: `0 6 * * *` (daily 06:00 UTC) · **No LLM**

Flow: `GET /recurring-work` (templates with elapsed interval) → for each template `POST /recurring-spawn`.
Works on the legacy `recurringTodos` table. New-model recurring todos auto-reset via PM2 notif agent instead.

### Quest generation
**Cron**: `0 7 * * 1` (Monday 07:00 UTC) · **Model**: claude-sonnet-4-6

Flow: `GET /quests-work` (users + their recurring todos) → design 1–2 quests per user requiring 3–4 task completions → `POST /quests-save`.
Quest fingerprint: `"week-YYYY-WW:slug"`. Bonus stars awarded when all questTodos for a user are completed.

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
- **Never** use `pm2 restart --update-env` — silently wipes ALL env vars (ANTHROPIC_API_KEY, VAPID_PRIVATE_KEY)
- **Never** skip updating `api.d.ts` when adding a new convex module — build fails with cryptic TS errors
- **Never** use `api.*` inside `httpAction` handlers — always use `internal.*`
- **Never** regenerate VAPID keys without wiping and re-subscribing all push subscriptions in the DB
- **Prefer `/schedule` over new PM2 processes** for batch jobs — PM2 only when latency < 1 min is required

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

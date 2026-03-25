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

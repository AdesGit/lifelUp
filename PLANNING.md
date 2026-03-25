# LifeLup — Project Planning & Architecture

> **Always read this file** at the start of a new conversation.
> It is the single source of truth for stack, structure, commands, and the WISC workflow.

---

## Project Overview

LifeLup is a gamified family task management app with real-time AI coaching.
Currently in MVP phase — a small family of users, self-hosted on a single VPS.

**Stack:**
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Convex self-hosted (`@convex-dev/auth`, Password provider)
- **AI**: Anthropic API — claude-haiku-4-5 (coach), claude-sonnet-4-6 (extraction agents)
- **Deployment**: Hostinger VPS (Ubuntu 24.04), PM2, Nginx, Docker

**Key URLs:**
- App: `https://lifelup.aidigitalassistant.cloud` (port 3000, PM2)
- Convex: `https://convex.aidigitalassistant.cloud` (port 3210 sync engine / 3211 HTTP actions)

---

## Project Structure

```
app/
  layout.tsx                  # Root layout — registers service worker for push notifications
  page.tsx                    # Protected home — todo list + 🔔 push subscribe button
  family/page.tsx             # Family view — per-user tabs
  coach/page.tsx              # AI coach chat (polling-based)
  goals/page.tsx              # AI-extracted medium/long-term goals per user
  context/page.tsx            # Family knowledge base (fiches mémo)
  todos/recurring/page.tsx    # Manage recurring todos (filter view of isRecurring todos)
  quests/page.tsx             # Weekly quest progress + bonus stars
  signin/page.tsx             # Sign in only (sign-up disabled)
components/
  ConvexClientProvider.tsx    # ConvexAuthProvider + AuthErrorBoundary
  SignInForm.tsx               # Email/password sign-in form
  SignOutButton.tsx            # Signs out + redirects to /signin
  TodoList.tsx                 # Per-user todo list + inline recurring creation
  PushNotificationButton.tsx  # Bell icon — one-click Web Push subscribe
convex/
  schema.ts         # All tables (see schema section below)
  auth.ts           # Password provider
  auth.config.ts    # Auth domain (CONVEX_SITE_URL || hardcoded fallback)
  http.ts           # HTTP routes: auth + /agent/v1/* endpoints (10 total)
  users.ts          # getMe query
  todos.ts          # list, create, toggle, remove + recurring + push subscription
  coach.ts          # session management, message store, getPendingSessions (internal)
  goals.ts          # list (public), upsertGoal (internal), getUsersWithHistory (internal)
  context.ts        # CRUD (public), upsertEntry (internal), getAllEntries (internal)
  recurringTodos.ts # Legacy template CRUD + spawn (pre-gamification model)
  quests.ts         # list (public), upsertQuest (internal), checkQuestCompletion (internal)
  admin.ts          # deleteAllUsers (dev/debug only)
  _generated/api.d.ts  # Manually maintained — add new modules here after adding convex/*.ts
public/
  sw.js             # Service worker — handles Web Push events + notification click
lifelup-agent/      # Background agent scripts (separate directory, not in Next.js build)
  coach-poll.mjs          # PM2: coach reply polling (15s interval)
  star-evaluator.mjs      # PM2: assigns star values to unrated todos (5min interval)
  notification-sender.mjs # PM2: sends Web Push for due recurring todos (1min interval)
  ecosystem.config.cjs    # PM2 process config for all three agents above
  package.json            # web-push dependency for notification-sender
examples/               # Code pattern files — read before implementing
PRPs/                   # Product Requirements Prompts — one per feature
  templates/prp_lifelup.md   # Base template for all new PRPs
  EXAMPLE_goals_agent.md     # Completed example to reference
validation/
  lifelup_validate.md   # System health check commands
.claude/rules/          # Auto-loaded per file type (agents, convex, frontend, deployment)
.claude/commands/       # Slash commands: /generate-prp, /execute-prp, /commit, /prime, etc.
.github/workflows/
  deploy.yml            # ⚠️ BROKEN — SSH from GitHub IPs is blocked. Deploy manually.
ecosystem.config.cjs    # PM2 config for lifelup Next.js app (port 3000)
```

### Convex Schema (current tables)

| Table | Key fields | Notes |
|-------|-----------|-------|
| `users` | email, totalStars | totalStars = cumulative ⭐ |
| `todos` | userId, text, completed, starValue, isRecurring, frequency, scheduledTime, nextDueAt | isRecurring todos auto-reset at nextDueAt |
| `recurringTodos` | userId, text, frequency, starValue, lastSpawnedAt | Legacy spawn-template model |
| `quests` | title, bonusStars, weekStart, status, fingerprint | Weekly AI-generated challenges |
| `questTodos` | questId, userId, recurringTodoId, completed | Per-user quest task items |
| `pushSubscriptions` | userId, endpoint, p256dh, auth | Web Push credentials per device |
| `agentSessions` | userId, type | Coach chat sessions |
| `agentMessages` | sessionId, role, content | Coach messages |
| `contextEntries` | title, category, content, fingerprint | Family knowledge base |
| `goals` | userId, category, horizon, progress, fingerprint | AI-extracted goals |

---

## Essential Commands

```bash
# Dev (Claude Code session IS the VPS — no SSH needed)
npm run dev

# Deploy Convex — run from /home/claude/dev/lifelUp
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# Production deploy — GitHub Actions is BROKEN, run directly on VPS:
cd /var/www/lifelup && git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup

# Restart Convex Docker
cd /opt/convex && sudo docker compose down && sudo docker compose up -d

# All PM2 agents — NEVER use --update-env (wipes env vars silently):
cd /home/claude/dev/lifelup-agent
pm2 delete lifelup-coach lifelup-star-evaluator lifelup-notif
pm2 start ecosystem.config.cjs
pm2 save

# Start only one agent (e.g. after changing its script):
pm2 delete lifelup-coach && pm2 start ecosystem.config.cjs --only lifelup-coach && pm2 save

# Check agent logs:
pm2 logs lifelup-coach --lines 30 --nostream
pm2 logs lifelup-star-evaluator --lines 30 --nostream
pm2 logs lifelup-notif --lines 30 --nostream

# List all processes:
pm2 list
```

---

## Environment Variables

### Next.js app (`/var/www/lifelup/.env.production`)
```
NEXT_PUBLIC_CONVEX_URL=https://convex.aidigitalassistant.cloud
```

### Convex Docker (`/opt/convex/.env`)
```
INSTANCE_NAME=convex-self-hosted
INSTANCE_SECRET=<secret>
RUST_LOG=info
CONVEX_CLOUD_ORIGIN=https://convex.aidigitalassistant.cloud
CONVEX_SITE_ORIGIN=https://convex.aidigitalassistant.cloud  ← sets JWT issuer, critical
```

### Convex runtime (set via `npx convex env set`)
```
JWT_PRIVATE_KEY=<rsa-private-key-single-line>
JWKS={"keys":[{"use":"sig","alg":"RS256",...}]}
SITE_URL=https://lifelup.aidigitalassistant.cloud
AGENT_SECRET=de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
```

---

## Agent Architecture

All agent endpoints: `https://convex.aidigitalassistant.cloud/agent/v1/*`
Protected by: `Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4`

### Current agents

| Agent | Runner | Schedule | Model | Endpoints used |
|-------|--------|----------|-------|----------------|
| Coach replies | PM2 polling | Every 15s | claude-haiku-4-5 | GET /pending · POST /reply |
| Star evaluator | PM2 polling | Every 5min | claude-haiku-4-5 | GET /todos-unevaluated · POST /todos-star |
| Push notifications | PM2 polling | Every 1min | *(no LLM)* | GET /notify-due · POST /notify-reset |
| Goals extraction | Claude Code `/schedule` | Daily 00:00 UTC | claude-sonnet-4-6 | GET /goals-work · POST /goals-save |
| Context extraction | Claude Code `/schedule` | Sunday 02:00 UTC | claude-sonnet-4-6 | GET /context · POST /context-save |
| Recurring reset | Claude Code `/schedule` | Daily 06:00 UTC | *(no LLM)* | GET /recurring-work · POST /recurring-spawn |
| Quest generation | Claude Code `/schedule` | Monday 07:00 UTC | claude-sonnet-4-6 | GET /quests-work · POST /quests-save |

### Two runner types in use

**PM2 polling** (for time-critical or always-on work):
- Lives in `/home/claude/dev/lifelup-agent/`
- Managed via `ecosystem.config.cjs` — start with `pm2 start ecosystem.config.cjs`
- Never use `--update-env` — silently wipes env vars. Use delete + start cycle.
- Logs: `pm2 logs <name> --lines 30 --nostream`

**Claude Code `/schedule`** (for periodic batch jobs — preferred for new agents):
- Uses Claude Code's built-in RemoteTrigger (cron) — no separate process to manage
- Runs a Claude Code session on a schedule; the session calls the HTTP endpoints directly
- Set up via `/schedule` skill in Claude Code
- Current schedules managed at: see RemoteTriggers section below
- Advantage: no always-on process, no credential management, Claude can reason about failures

### Claude Code async patterns

**`/loop`** — run a task repeatedly in the current session:
```
/loop 5m check GET /agent/v1/todos-unevaluated and rate any unrated todos
```
Use for: ad-hoc polling during a dev session (not persistent across restarts).

**`/schedule`** — create a persistent RemoteTrigger (cron):
```
/schedule "0 6 * * *" spawn any recurring todos that are due via GET /agent/v1/recurring-work
```
Use for: production scheduled jobs. Runs even when no Claude Code session is active.

### RemoteTriggers (Claude Code `/schedule`)

Set up or inspect via `/schedule` skill in Claude Code. Currently configured:

| Trigger | Cron | What it does |
|---------|------|-------------|
| goals-daily | `0 0 * * *` | Extract goals from coach history for all users |
| context-weekly | `0 2 * * 0` | Extract context entries from coach history |
| recurring-daily | `0 6 * * *` | Spawn todos from recurring templates (legacy model) |
| quests-weekly | `0 7 * * 1` | Generate this week's quests for all users with recurring todos |

To add a new RemoteTrigger: `/schedule "0 8 * * *" <describe what to do in plain English>`

---

## Key Gotchas (learned from git history)

### JWT Issuer — `||` not `??` (commit 245acb2)
`CONVEX_SITE_URL` = `""` (empty string) during CLI evaluation, not `undefined`.
`??` passes empty string through → JWT `iss: ""` → `NoAuthProvider` on every query.
Fix: `process.env.CONVEX_SITE_URL || "https://convex.aidigitalassistant.cloud"`

### api.d.ts Must Be Updated Manually Before Build
When adding `convex/newmodule.ts`:
1. Add `import type * as newmodule from "../newmodule.js";`
2. Add `newmodule: typeof newmodule;` to `fullApi` `ApiFromModules`
3. Commit before `npm run build` — the build reads the local committed copy

### GitHub Actions is Permanently Broken
SSH from GitHub IP ranges is blocked by Hostinger VPS firewall. Always deploy directly.

### Coach Agent Env Wipe
`pm2 restart lifelup-coach --update-env` silently wipes ANTHROPIC_API_KEY.
Always use: `pm2 delete lifelup-coach && pm2 start ecosystem.config.cjs && pm2 save`

### Fingerprint Deduplication Required for Agent-Writable Tables
All tables written by scheduled agents need `fingerprint` field + upsert-by-fingerprint.
Goals: `"category:slug"`, Context: `"category:slugified-title"`.

### VAPID Keys Are Fixed — Do Not Regenerate
Web Push uses a fixed VAPID key pair. The public key is hardcoded in `components/PushNotificationButton.tsx`.
The private key is in `lifelup-agent/ecosystem.config.cjs` (`VAPID_PRIVATE_KEY` env).
**If you regenerate keys, all existing push subscriptions break** — users must re-subscribe.
Keys: public = `BAzih9T...` (see PushNotificationButton.tsx), private = in ecosystem.config.cjs.

### Recurring Todos — Two Models Coexist
- **Legacy model**: `recurringTodos` table (templates) → spawned as entries in `todos` via `/agent/v1/recurring-spawn`
- **New model**: `todos` with `isRecurring: true` + `scheduledTime` + `nextDueAt` → auto-reset in place via notification agent
Both models write to `todos`. New recurring todos created from the UI use the new model.

---

## WISC Workflow — How to Build New Features

Every feature follows **W → I → S → C**:

| Step | Action | Tool |
|------|--------|------|
| **W** — What | Fill `INITIAL.md` with the feature request | Editor |
| **I** — Implementation | `/generate-prp` → produces `PRPs/{feature}.md` | Slash command |
| **S** — Success | Review PRP success criteria + validation gates before coding | Review |
| **C** — Context | `/execute-prp PRPs/{feature}.md` reads all context, implements, validates | Slash command |

**Reference files:**
- Intake form: `INITIAL.md`
- PRP template: `PRPs/templates/prp_lifelup.md`
- Completed example: `PRPs/EXAMPLE_goals_agent.md`
- Code patterns: `examples/` (convex-mutation.ts, convex-http-agent.ts, app-page.tsx, agent-script.mjs)
- System health check: `validation/lifelup_validate.md`

**Confidence score rule:** PRPs with score < 7 should not be executed without clarifying `INITIAL.md` first.

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
  layout.tsx            # Root layout — wraps with ConvexClientProvider
  page.tsx              # Protected home — per-user todo list
  family/page.tsx       # Family view — all users' todos
  coach/page.tsx        # AI coach chat (polling-based)
  goals/page.tsx        # AI-extracted medium/long-term goals per user
  context/page.tsx      # Family knowledge base (fiches mémo)
  signin/page.tsx       # Sign in only (sign-up disabled)
components/
  ConvexClientProvider.tsx  # ConvexAuthProvider + AuthErrorBoundary
  SignInForm.tsx         # Email/password sign-in form
  SignOutButton.tsx      # Signs out + redirects to /signin
  TodoList.tsx           # Per-user real-time todo list
convex/
  schema.ts             # All tables: authTables + users + todos + agentSessions + agentMessages + goals + contextEntries
  auth.ts               # Password provider
  auth.config.ts        # Auth domain (CONVEX_SITE_URL || hardcoded fallback)
  http.ts               # HTTP routes: auth + /agent/v1/* endpoints
  users.ts              # getMe query
  todos.ts              # list, create, toggle, remove
  coach.ts              # session management, message store, getPendingSessions (internal)
  goals.ts              # list (public), upsertGoal (internal), getUsersWithHistory (internal)
  context.ts            # CRUD (public), upsertEntry (internal), getAllEntries (internal)
  admin.ts              # deleteAllUsers (dev/debug only)
  _generated/api.d.ts   # Manually maintained — add new modules here after adding convex/*.ts files
examples/               # Code pattern files — read before implementing (see WISC Workflow below)
PRPs/                   # Product Requirements Prompts — one per feature
  templates/prp_lifelup.md   # Base template for all new PRPs
  EXAMPLE_goals_agent.md     # Completed example to reference
validation/
  lifelup_validate.md   # System health check commands
.claude/rules/          # Auto-loaded per file type (agents, convex, frontend, deployment)
.claude/commands/       # Slash commands: /generate-prp, /execute-prp, /commit, /prime, etc.
.github/workflows/
  deploy.yml            # ⚠️ BROKEN — SSH from GitHub IPs is blocked. Deploy manually.
ecosystem.config.js     # PM2 config for lifelup app (port 3000)
```

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

# Coach agent — NEVER use --update-env (wipes ANTHROPIC_API_KEY silently):
pm2 delete lifelup-coach && pm2 start ecosystem.config.cjs && pm2 save
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

Three-tier system. Details in `.claude/rules/agents.md`.

| Agent | Type | Schedule | Model |
|-------|------|----------|-------|
| Coach replies | PM2 polling (15s) | Continuous | claude-haiku-4-5 |
| Goals extraction | RemoteTrigger | Daily midnight UTC | claude-sonnet-4-6 |
| Context extraction | RemoteTrigger | Sunday 2am UTC | claude-sonnet-4-6 |

All agent endpoints: `https://convex.aidigitalassistant.cloud/agent/v1/*`
Protected by: `Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4`

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

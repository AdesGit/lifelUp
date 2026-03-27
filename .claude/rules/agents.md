---
paths:
  - "convex/coach.ts"
  - "convex/goals.ts"
  - "convex/context.ts"
  - "convex/http.ts"
  - "convex/todos.ts"
  - "convex/quests.ts"
  - "convex/recurringTodos.ts"
  - "convex/uploads.ts"
  - "lifelup-agent/*.mjs"
---

# AI Agent Architecture

## Standard Pattern — ALL future agents must follow this

Every agent in LifeLup follows the same loop:

```
1. GET context from Convex HTTP endpoint
       ↓
2. Build prompt (instructions in code or Convex + context data)
       ↓
3. claude --print "prompt" → result   ← Claude Code CLI, no API key needed
       ↓
4. POST result back to Convex HTTP endpoint
       ↓
5. Sleep / wait for next cycle
```

**Rule: never use the Anthropic SDK or `ANTHROPIC_API_KEY` directly in agent scripts.**
Always use `execFileSync(CLAUDE_BIN, ['--print', prompt])` instead.
Claude Code is already authenticated on the VPS — no credential management needed.

### Why this pattern

- **No API key rotation** — Claude Code's own auth is durable
- **Instructions in code or Convex** — either hardcoded (simple) or fetched from a Convex table (configurable without redeployment)
- **Context always from Convex** — agent always works on current live data
- **Uniform** — every agent is readable and debuggable the same way

---

## Agent Template

See `examples/agent-template.mjs` for a copy-paste starting point.

Skeleton:

```javascript
import { execFileSync } from "child_process";

const CONVEX_URL = "https://convex.aidigitalassistant.cloud";
const AGENT_SECRET = process.env.AGENT_SECRET;
const CLAUDE_BIN = "/home/claude/.local/bin/claude";
const POLL_MS = 5 * 60 * 1000; // adjust per agent

// ── Instructions (hardcoded or fetched from Convex) ──────────────────────────
const INSTRUCTIONS = `
  You are the LifeLup [name] agent. Your job is [description].
  [rules, output format, constraints]
`;

// ── 1. Fetch context from Convex ─────────────────────────────────────────────
async function fetchWork() {
  const res = await fetch(`${CONVEX_URL}/agent/v1/[endpoint]`, {
    headers: { Authorization: `Bearer ${AGENT_SECRET}` },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

// ── 2 + 3. Build prompt + call Claude Code ────────────────────────────────────
function runClaude(context) {
  const prompt = `${INSTRUCTIONS}\n\nData:\n${JSON.stringify(context, null, 2)}\n\nOutput ONLY valid JSON.`;
  const output = execFileSync(CLAUDE_BIN, ["--print", prompt], {
    encoding: "utf8",
    timeout: 60_000,
  });
  const match = output.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in output: ${output}`);
  return JSON.parse(match[0]);
}

// ── 4. Save results back to Convex ────────────────────────────────────────────
async function saveResults(results) {
  const res = await fetch(`${CONVEX_URL}/agent/v1/[save-endpoint]`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AGENT_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(results),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const work = await fetchWork();
    if (!work?.length) return;
    console.log(`[agent] ${new Date().toISOString()} — processing ${work.length} items`);
    const results = runClaude(work);
    const saved = await saveResults(results);
    console.log(`[agent] saved:`, saved);
  } catch (err) {
    console.error(`[agent] error:`, err.message);
  }
}

poll();
setInterval(poll, POLL_MS);
console.log(`[agent] started — polling every ${POLL_MS / 1000}s`);
```

---

## Runner Types

### PM2 polling — for sub-5-minute cadence or always-on work

Lives in `/home/claude/dev/lifelup-agent/`. Registered in `ecosystem.config.cjs`.
No `ANTHROPIC_API_KEY` — only `AGENT_SECRET` for Convex HTTP auth.

```javascript
// ecosystem.config.cjs entry
{
  name: "lifelup-[agent-name]",
  script: "/home/claude/dev/lifelup-agent/[agent].mjs",
  interpreter: "node",
  env: {
    AGENT_SECRET: "de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4"
    // add other non-AI secrets here (e.g. VAPID_PRIVATE_KEY for notif agent)
    // NEVER add ANTHROPIC_API_KEY — use claude --print instead
  }
}
```

PM2 lifecycle:
```bash
# Start new agent
pm2 start ecosystem.config.cjs --only lifelup-[name] && pm2 save

# Update an agent script (delete + start, NEVER --update-env)
pm2 delete lifelup-[name] && pm2 start ecosystem.config.cjs --only lifelup-[name] && pm2 save

# Logs
pm2 logs lifelup-[name] --lines 30 --nostream
```

### Claude Code `/schedule` — for hourly+ batch jobs

Preferred for jobs that run less than once per hour. No PM2 process needed.
Set up via `/schedule` skill. The scheduled session calls HTTP endpoints and reasons about results.

---

## Current Agents

| Agent | Runner | Cadence | Uses LLM | Endpoints |
|-------|--------|---------|----------|-----------|
| `lifelup-coach` | PM2 | Every 5 min | ✓ claude --print | GET /pending · POST /reply |
| `lifelup-star-evaluator` | PM2 | Every 5 min | ✓ claude --print | GET /todos-unevaluated · POST /todos-star |
| `lifelup-image-agent` | PM2 | Daily 02:00 UTC | ✓ claude --print (multimodal) | GET /uploads-unprocessed · POST /uploads-process |
| `lifelup-notif` | PM2 | Every 1 min | ✗ | GET /notify-due · POST /notify-reset |
| goals-daily | `/schedule` | Daily 00:00 UTC | ✓ Claude session | GET /goals-work · POST /goals-save |
| context-weekly | `/schedule` | Sunday 02:00 UTC | ✓ Claude session | GET /context · POST /context-save |
| recurring-daily | `/schedule` | Daily 06:00 UTC | ✗ | GET /recurring-work · POST /recurring-spawn |
| quests-weekly | `/schedule` | Monday 07:00 UTC | ✓ Claude session | GET /quests-work · POST /quests-save |

---

## HTTP Agent Endpoints (`convex/http.ts`)

All under `https://convex.aidigitalassistant.cloud/agent/v1/*`
Bearer token: `de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4`

| Method | Path | Agent | Purpose |
|--------|------|-------|---------|
| GET | `/pending` | coach | Sessions needing reply |
| POST | `/reply` | coach | Save coach reply |
| GET | `/todos-unevaluated` | star-evaluator | Todos/templates without starValue |
| POST | `/todos-star` | star-evaluator | Set star values in batch |
| GET | `/uploads-unprocessed` | image-agent | Image uploads not yet described |
| POST | `/uploads-process` | image-agent | Save compressed image + description |
| POST | `/uploads-reset-processed` | admin | Reset imageProcessed flags |
| GET | `/goals-work` | /schedule | Users + history + existing goals |
| POST | `/goals-save` | /schedule | Upsert goals |
| GET | `/context` | /schedule | All context entries |
| POST | `/context-save` | /schedule | Upsert context entries |
| GET | `/recurring-work` | /schedule | Templates needing spawn |
| POST | `/recurring-spawn` | /schedule | Spawn one recurring todo |
| GET | `/quests-work` | /schedule | Users + recurring todos |
| POST | `/quests-save` | /schedule | Upsert quests |
| GET | `/notify-due` | notif | Recurring todos past nextDueAt |
| POST | `/notify-reset` | notif | Reset todo + advance nextDueAt |

Routes go through Nginx → port 3211 (Convex HTTP actions). Port 3210 = sync engine.

---

## Adding a New Agent — Checklist

### 1. Convex backend (`convex/newmodule.ts`)
- Add table to `schema.ts` (fingerprint field + `by_fingerprint` index if agent writes)
- `internalQuery` for agent reads
- `internalMutation` with upsert-by-fingerprint for agent writes
- Public `query`/`mutation` for web app if needed

### 2. HTTP endpoints (`convex/http.ts`)
- GET `fetch-work` endpoint (calls `internalQuery`)
- POST `save-results` endpoint (calls `internalMutation` in a loop)
- First line of every handler: `if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });`

### 3. `convex/_generated/api.d.ts`
- Add `import type * as newmodule from "../newmodule.js";`
- Add `newmodule: typeof newmodule;` to `fullApi`
- Do this BEFORE `npm run build`

### 4. Agent script (`lifelup-agent/new-agent.mjs`)
- Copy `examples/agent-template.mjs`
- Set `INSTRUCTIONS` (hardcoded or fetched from Convex)
- Replace the fetch/save endpoint paths
- Parse Claude's JSON output robustly (regex match before JSON.parse)

### 5. PM2 registration (`lifelup-agent/ecosystem.config.cjs`)
- Add entry with `AGENT_SECRET` only (no API keys)
- Start: `pm2 start ecosystem.config.cjs --only lifelup-[name] && pm2 save`

### 6. Validation
```bash
# 401 for wrong token
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/[endpoint]

# Valid JSON for correct token
curl -s -H "Authorization: Bearer de5430..." \
  https://convex.aidigitalassistant.cloud/agent/v1/[endpoint]

# Build passes
npm run build 2>&1 | tail -5

# Agent logs clean
pm2 logs lifelup-[name] --lines 20 --nostream
```

---

## Anti-Patterns

- **Never** use `ANTHROPIC_API_KEY` in agent scripts — use `claude --print` instead
- **Never** use `pm2 restart --update-env` — silently wipes env vars
- **Never** use `api.*` inside `httpAction` handlers — always use `internal.*`
- **Never** skip updating `api.d.ts` when adding a new Convex module
- **Never** add agent-writable tables without `fingerprint` + upsert-by-fingerprint
- **Never** call Convex public API from agent scripts — only `/agent/v1/*` HTTP endpoints
- **Never** put `AGENT_SECRET` in frontend code

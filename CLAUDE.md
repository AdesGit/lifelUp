### 🔄 Project Awareness & Context
- **Always read `PLANNING.md`** at the start of a new conversation to understand the project's architecture, goals, stack, commands, and constraints.
- **Before starting any new feature**, check `PRPs/` for an existing PRP. If none exists, follow the WISC workflow: fill `INITIAL.md` → run `/generate-prp` → review → run `/execute-prp`.
- **Use consistent naming conventions, file structure, and architecture patterns** as described in `PLANNING.md` and the `.claude/rules/` files (auto-loaded per file type).
- **Never assume context** — if a file path, function name, or env var is uncertain, read the file first.

### 🧱 Code Structure & Modularity
- **Never create a file longer than 300 lines.** If a file approaches this limit, split it into focused modules.
- **Organize Convex code by domain**: one file per feature (`todos.ts`, `goals.ts`, `context.ts`). Public functions at top, internal functions below.
- **Separate concerns**: pages in `app/`, reusable components in `components/`, Convex functions in `convex/`, agent scripts in `lifelup-agent/`.
- **When adding a new `convex/` module**, always update `convex/_generated/api.d.ts` manually before running `npm run build`. See `PLANNING.md` for the exact 3-step process.

### 🧪 Testing & Reliability
- **No automated test suite (MVP phase).** Every change must pass this validation sequence before deploying:
  1. `npm run build` — zero TypeScript errors
  2. `npm run lint` — zero ESLint warnings
  3. `npx convex deploy` — schema validates, functions deploy (after any Convex change)
  4. Manual browser check at `https://lifelup.aidigitalassistant.cloud`
  5. For agent changes: `pm2 logs lifelup-coach --lines 20 --nostream`
- **Run the full system health check** in `validation/lifelup_validate.md` after any significant change.
- **For new HTTP agent endpoints**, always verify: wrong Bearer token → 401, correct token → valid JSON.

### ✅ Task Completion
- **Follow the WISC pipeline** for all new features: W (INITIAL.md) → I (/generate-prp) → S (review PRP) → C (/execute-prp).
- **After implementing**, run the full validation sequence from the PRP before deploying to production.
- **Production deploy is always manual** — GitHub Actions is broken (SSH blocked). See `PLANNING.md` for deploy commands.
- **After deploying Convex schema changes**, no second deploy needed — `npx convex deploy` in Step 3 already pushed them.

### 📎 Style & Conventions
- **TypeScript** — no `any` types. Use proper types or `unknown` with type guards.
- **Tailwind CSS only** — no inline `style={{}}` props, ever.
- **Convex functions** — every arg must use explicit `v` validators. Public functions always check auth via `getAuthUserId(ctx)`. Internal functions skip auth (intentional — agent-only access).
- **Client components** — import Convex API from `@/convex/_generated/api`, never from `convex/` directly. Always add `"use client"` when using hooks.
- **HTTP actions** — always use `internal.*` inside `httpAction` handlers, never `api.*`.
- **Agent-writable tables** — must include `fingerprint` field + upsert-by-fingerprint pattern to prevent duplicate records on repeated agent runs.

### 📚 Documentation & Explainability
- **Update `PLANNING.md`** when the project structure changes, new pages are added, or new agents are created.
- **Update the relevant `.claude/rules/` file** when adding a new pattern or discovering a new gotcha.
- **After completing a feature via WISC**, the executed PRP in `PRPs/` serves as its documentation — leave it there.
- **Comment non-obvious decisions** with an inline `// Why:` comment explaining the reasoning, not just the what.

### 🧠 AI Behavior Rules
- **Never assume missing context. Read the file first.**
- **Never hallucinate function names, table names, or env vars** — verify they exist in `convex/schema.ts`, `convex/_generated/api.d.ts`, or `PLANNING.md`.
- **Never delete or overwrite existing code** unless explicitly instructed or called for by the PRP being executed.
- **Never use `pm2 restart lifelup-coach --update-env`** — it silently wipes ANTHROPIC_API_KEY. Use the full delete+start cycle.
- **Never use `api.*` inside `httpAction` handlers** — always `internal.*`.
- **Always check the PRP confidence score** before executing. Score < 7 → clarify `INITIAL.md` before proceeding.

# LifeLup — Global Rules

## Stack
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Convex self-hosted (`@convex-dev/auth`, Password provider)
- **Deployment**: Hostinger VPS (Ubuntu 24.04), PM2, Nginx, Docker

## Key URLs
- App: `https://lifelup.aidigitalassistant.cloud` (port 3000, PM2)
- Convex: `https://convex.aidigitalassistant.cloud` (port 3210, Docker)

## Project Structure
```
app/
  layout.tsx            # Root layout — wraps with ConvexClientProvider
  page.tsx              # Protected home — per-user todo list
  family/page.tsx       # Family view — all users' todos
  coach/page.tsx        # AI coach chat (real-time, polling-based)
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
.github/workflows/
  deploy.yml            # ⚠️ BROKEN — SSH from GitHub IPs is blocked. Deploy manually (see below).
ecosystem.config.js     # PM2 config for lifelup app (port 3000)
scripts/setup-vps.sh    # One-time VPS provisioning script
```

## Essential Commands
```bash
# Dev (runs locally on VPS — this Claude Code session IS the VPS)
npm run dev

# Deploy Convex — run from /home/claude/dev/lifelUp
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# Production deploy — GitHub Actions is BROKEN, run this directly on VPS:
cd /var/www/lifelup && git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup

# Restart Convex Docker
cd /opt/convex && sudo docker compose down && sudo docker compose up -d

# Coach polling agent (PM2 id=2) — restart after changes to coach-poll.mjs
cd /home/claude/dev/lifelup-agent && pm2 restart lifelup-coach
# Full restart with env vars:
pm2 delete lifelup-coach && pm2 start ecosystem.config.cjs && pm2 save
```

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
CONVEX_SITE_ORIGIN=https://convex.aidigitalassistant.cloud
```
⚠️ `CONVEX_CLOUD_ORIGIN` and `CONVEX_SITE_ORIGIN` are critical — they set the JWT issuer.
Both must equal the Convex public URL. Without them, `iss: ""` in JWTs → auth fails.

### Convex runtime env (set via `npx convex env set`)
```
JWT_PRIVATE_KEY=<rsa-private-key-single-line>
JWKS={"keys":[{"use":"sig","alg":"RS256",...}]}
SITE_URL=https://lifelup.aidigitalassistant.cloud
```

## Conventions
- All Convex queries/mutations in `convex/` — never import server utils in client components
- Auth state: `useConvexAuth()` or `useAuthActions()` from `@convex-dev/auth/react`
- Protected pages: check `isAuthenticated`, redirect to `/signin` via `useEffect`
- `AuthErrorBoundary` in `ConvexClientProvider` clears stale tokens automatically
- Tailwind only — no inline styles
- Keep CLAUDE.md lean — domain details go in `.claude/rules/`

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
  page.tsx              # Protected home — todo list
  signin/page.tsx       # Sign in / sign up
components/
  ConvexClientProvider.tsx  # ConvexAuthProvider + AuthErrorBoundary
  SignInForm.tsx         # Email/password form (signIn/signUp toggle)
  SignOutButton.tsx      # Signs out + redirects to /signin
  TodoList.tsx           # Per-user real-time todo list
convex/
  schema.ts             # authTables + users + todos
  auth.ts               # Password provider
  auth.config.ts        # Auth domain (CONVEX_SITE_URL || hardcoded fallback)
  http.ts               # auth.addHttpRoutes(http)
  users.ts              # getMe query
  todos.ts              # list, create, toggle, remove
  admin.ts              # deleteAllUsers (dev/debug only)
.github/workflows/
  deploy.yml            # Auto-deploy on push to main via SSH
ecosystem.config.js     # PM2 config (port 3000)
scripts/setup-vps.sh    # One-time VPS provisioning script
```

## Essential Commands
```bash
# Dev
npm run dev

# Deploy Convex (from VPS or with external URL)
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy

# Production deploy (VPS)
cd /var/www/lifelup && git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup

# Restart Convex Docker
cd /opt/convex && sudo docker compose down && sudo docker compose up -d
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

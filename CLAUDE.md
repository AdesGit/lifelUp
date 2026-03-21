# LifeLup — Global Rules

## Stack
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Convex (self-hosted at `https://convex.aidigitalassistant.cloud`)
- **Auth**: `@convex-dev/auth` with Password provider
- **Deployment**: Hostinger VPS (Ubuntu 24.04), PM2, Nginx

## Key URLs
- App: `https://lifelup.aidigitalassistant.cloud` (port 3000)
- Convex: `https://convex.aidigitalassistant.cloud` (port 3210 internal)

## Project Structure
```
app/                    # Next.js App Router pages
  layout.tsx            # Root layout with ConvexAuthProvider
  page.tsx              # Protected home (redirects if not auth'd)
  signin/page.tsx       # Sign in / sign up page
components/             # Shared React components
  ConvexClientProvider.tsx  # Convex + Auth provider wrapper
  SignInForm.tsx         # Email/password auth form
  SignOutButton.tsx       # Sign out button
convex/                 # Convex backend functions
  schema.ts             # DB schema (authTables + app tables)
  auth.ts               # Auth setup (Password provider)
  auth.config.ts        # Auth domain config
  http.ts               # HTTP router (auth routes)
  users.ts              # User queries/mutations
.claude/
  commands/             # Slash commands (prime, plan, execute, handoff, commit)
  rules/                # Auto-loaded per file path
  docs/                 # Heavy reference for sub-agents
```

## Essential Commands
```bash
# Dev
npm run dev                          # Next.js dev server (port 3000)

# Convex (self-hosted)
CONVEX_SELF_HOSTED_URL=http://localhost:3210 \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy                    # Deploy convex functions

# Deploy
pm2 restart lifelup                  # Restart production app
```

## Environment Variables
```
CONVEX_DEPLOYMENT=                   # Set by convex CLI
NEXT_PUBLIC_CONVEX_URL=https://convex.aidigitalassistant.cloud
```

## Conventions
- All Convex queries/mutations are in `convex/` as `.ts` files
- Never import Convex server utilities in client components
- Auth state via `useConvexAuth()` or `useAuthActions()` from `@convex-dev/auth/react`
- Protected pages: use `useConvexAuth()` and redirect if `!isAuthenticated`
- Keep rule files in `.claude/rules/` scoped to paths — not in CLAUDE.md

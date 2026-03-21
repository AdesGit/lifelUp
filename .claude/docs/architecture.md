# LifeLup Architecture Deep Dive

> **Usage**: This doc is for sub-agent research only. Do not load into main session unless asked.
> A sub-agent should read the first 20 lines to determine relevance, then load in full if needed.

## System Overview

LifeLup is a gamified family task management app.

**Stack:**
- Next.js 15 (App Router) — frontend + API routes
- Convex (self-hosted) — real-time backend, database, auth
- `@convex-dev/auth` — authentication (Password + future OAuth)
- Tailwind CSS — styling
- PM2 — production process manager
- Nginx — reverse proxy + SSL termination

## Infrastructure

```
Internet → Nginx (443/SSL)
              ├─ lifelup.aidigitalassistant.cloud → Next.js :3000 (PM2)
              └─ convex.aidigitalassistant.cloud  → Convex Docker :3210
```

**VPS:** 72.62.129.117 (Hostinger, Ubuntu 24.04)
**App dir:** `/var/www/lifelup/`
**Convex dir:** `/opt/convex/`

## Authentication Flow

1. User submits email + password form (`/signin`)
2. `useAuthActions().signIn("password", formData)` → calls Convex HTTP auth route
3. Convex validates credentials, sets JWT cookie via `@convex-dev/auth`
4. `ConvexAuthProvider` updates `isAuthenticated` → app re-renders
5. Protected pages detect `isAuthenticated` and render content (or redirect to `/signin`)

## Convex Schema

### Auth Tables (from `authTables`)
- `authAccounts` — links users to auth providers
- `authSessions` — active sessions + JWT tokens
- `authVerificationCodes` — OTP codes for email verification
- `authVerificationAttempts` — rate limiting
- `authRateLimits` — brute force protection

### App Tables
- `users` — user profiles (name, email, xp, level)
- *(more tables added as features are implemented)*

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Public Convex URL for client |
| `CONVEX_SELF_HOSTED_URL` | Internal URL for deploys |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Admin key for CLI |

## Deployment

```bash
# 1. Build
npm run build

# 2. Deploy Convex functions
CONVEX_SELF_HOSTED_URL=http://localhost:3210 \
CONVEX_SELF_HOSTED_ADMIN_KEY="..." \
npx convex deploy

# 3. Restart app
pm2 restart lifelup
```

CI/CD via GitHub Actions (`.github/workflows/deploy.yml`) triggers on push to `main`.

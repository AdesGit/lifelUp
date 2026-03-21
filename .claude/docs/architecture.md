# LifeLup Architecture Deep Dive

> **Usage**: This doc is for sub-agent research only. Do not load into main session unless asked.
> Read the first 20 lines to assess relevance, then load in full if needed.

## System Overview

LifeLup is a gamified family task management app — currently in early MVP stage.

**Stack:**
- Next.js 15 (App Router) — frontend
- Convex (self-hosted) — real-time backend, database, auth
- `@convex-dev/auth` v0.0.91 — Password provider
- Tailwind CSS — styling
- PM2 — production process manager
- Nginx — reverse proxy + SSL (Let's Encrypt)
- Docker — runs the Convex backend

## Infrastructure

```
Internet → Nginx (443/SSL, Let's Encrypt)
              ├─ lifelup.aidigitalassistant.cloud  → Next.js :3000 (PM2, /var/www/lifelup)
              └─ convex.aidigitalassistant.cloud   → Convex Docker :3210 (/opt/convex)
```

**VPS:** 72.62.129.117 (Hostinger, Ubuntu 24.04), user: `claude` (sudo NOPASSWD)

## Authentication Flow (Detailed)

1. User submits email + password on `/signin`
2. `useAuthActions().signIn("password", formData)` calls the Convex `auth:signIn` action
3. Convex Password provider hashes password, creates session, issues JWT
4. JWT `iss` claim = `CONVEX_SITE_ORIGIN` from Docker env = `https://convex.aidigitalassistant.cloud`
5. Client stores JWT + refresh token in `localStorage` (keys below)
6. On each Convex query/mutation, client sends JWT → Convex validates against `auth.config.ts`
7. `auth.config.ts` domain must match JWT `iss` — or `NoAuthProvider` error

### Critical: JWT Issuer Chain
```
/opt/convex/.env
  CONVEX_SITE_ORIGIN=https://convex.aidigitalassistant.cloud
       ↓
Docker run_backend.sh maps to --convex-site flag
       ↓
Convex runtime CONVEX_SITE_URL = https://convex.aidigitalassistant.cloud
       ↓
@convex-dev/auth sets JWT iss = https://convex.aidigitalassistant.cloud
       ↓
auth.config.ts domain must equal https://convex.aidigitalassistant.cloud ✅
```

If `CONVEX_SITE_ORIGIN` is missing from `/opt/convex/.env`:
- JWT `iss` = `""` (empty string)
- All queries fail with `NoAuthProvider`

### Auth localStorage Keys
Stored by `@convex-dev/auth/react` in browser localStorage:
- `__convexAuthJWT` — current JWT token
- `__convexAuthRefreshToken` — refresh token
- `__convexAuthOAuthVerifier` — OAuth state
- `__convexAuthServerStateFetchTime` — cache timestamp

`AuthErrorBoundary` in `ConvexClientProvider.tsx` clears all of these on error and
redirects to `/signin` — handles stale tokens from broken previous sessions.

## Convex Schema

### Auth Tables (from `authTables`)
- `authAccounts` — links users to auth providers (password, oauth)
- `authSessions` — active sessions + JWT tokens
- `authVerificationCodes` — OTP codes for email verification
- `authVerificationAttempts` — rate limiting per attempt
- `authRateLimits` — brute force protection

### App Tables
- `users` — user profiles (email, name, image) with `email` index
- `todos` — per-user tasks (userId, text, completed) with `by_user` index

## Convex Docker Internals

Binary: `convex-local-backend` (inside container at `/convex/`)
Startup: `run_backend.sh` — reads env vars, maps to CLI flags

Key flag mapping:
| Env var | CLI flag | Purpose |
|---------|----------|---------|
| `CONVEX_CLOUD_ORIGIN` | `--convex-origin` | Convex API public URL |
| `CONVEX_SITE_ORIGIN` | `--convex-site` | Site/JWT issuer URL |
| `INSTANCE_NAME` | `--instance-name` | Instance identifier |
| `INSTANCE_SECRET` | `--instance-secret` | Signing secret |

Test issuer: `curl https://convex.aidigitalassistant.cloud/.well-known/openid-configuration`
Should return: `{"issuer":"https://convex.aidigitalassistant.cloud",...}`

## Key Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.production` | Client-side Convex URL |
| `CONVEX_CLOUD_ORIGIN` | `/opt/convex/.env` | Convex API public URL (Docker) |
| `CONVEX_SITE_ORIGIN` | `/opt/convex/.env` | JWT issuer URL (Docker) |
| `JWT_PRIVATE_KEY` | Convex runtime env | Signs session JWTs |
| `JWKS` | Convex runtime env | Public key for JWT verification |
| `SITE_URL` | Convex runtime env | Used for OAuth redirects / magic links |

## Deployment Pipeline

```
git push main
    ↓ (GitHub Actions: .github/workflows/deploy.yml)
SSH into VPS → git pull → npm ci → npm run build → pm2 restart lifelup
    ↓ (manual for Convex schema/function changes)
npx convex deploy (CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud)
```

Note: `npm run build` uses `NEXT_PUBLIC_CONVEX_URL` from `.env.production`.
Convex `_generated/` types are committed to the repo — rebuild locally after schema changes.

## Debugging Auth Issues

```bash
# 1. Check JWT issuer
curl https://convex.aidigitalassistant.cloud/.well-known/openid-configuration

# 2. Test sign-in directly
curl -X POST "https://convex.aidigitalassistant.cloud/api/run/auth/signIn" \
  -H "Content-Type: application/json" \
  -d '{"args":{"provider":"password","params":{"email":"x@x.com","password":"pass","flow":"signIn"}}}'

# 3. Decode JWT payload (second segment, base64)
# Check "iss" field matches auth.config.ts domain

# 4. List users
npx convex data users  # (with CONVEX_SELF_HOSTED_* env vars)

# 5. Delete all users (dev only)
npx convex run admin:deleteAllUsers --no-push
```

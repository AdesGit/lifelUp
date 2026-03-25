---
paths:
  - ".github/**"
  - "ecosystem.config.js"
  - "scripts/**"
---

# Deployment Conventions

## Where Claude Code Runs
**This Claude Code session runs directly ON the VPS** (`/home/claude/dev/lifelUp`).
- No SSH needed to deploy — just run commands directly
- Production app lives at `/var/www/lifelup/` (separate copy, served by PM2)
- Working dir `/home/claude/dev/lifelUp` is the dev/editing workspace; `/var/www/lifelup/` is prod

## VPS Info
- **IP**: 72.62.129.117 (Hostinger, Ubuntu 24.04, hostname: srv1192911)
- **User**: claude (sudo NOPASSWD)
- **App dir (prod)**: `/var/www/lifelup/`
- **Dev dir (this session)**: `/home/claude/dev/lifelUp/`
- **Convex dir**: `/opt/convex/`
- **Coach agent dir**: `/home/claude/dev/lifelup-agent/`

## Production Deploy
⚠️ **GitHub Actions is broken** — SSH from GitHub's IP ranges is blocked by the VPS firewall.
The `.github/workflows/deploy.yml` file exists but always fails at the SSH step.

**Deploy directly on the VPS:**
```bash
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
pm2 save
```

Always commit + push to GitHub first (`git push origin main`), then run the above.

## PM2 Processes
| ID | Name | What | Config |
|----|------|------|--------|
| 0 | `lifelup` | Next.js app (port 3000) | `/var/www/lifelup/ecosystem.config.js` |
| 2 | `lifelup-coach` | Coach polling agent (15s interval) | `/home/claude/dev/lifelup-agent/ecosystem.config.cjs` |

```bash
pm2 list                    # see all processes
pm2 logs lifelup            # Next.js app logs
pm2 logs lifelup-coach      # Coach agent logs (shows each poll + replies)
pm2 restart lifelup         # restart app after deploy
pm2 restart lifelup-coach   # restart after changing coach-poll.mjs
```

⚠️ The coach agent uses `ecosystem.config.cjs` (not `.js`) because it embeds the `ANTHROPIC_API_KEY` env var. Never use `pm2 restart lifelup-coach --update-env` — it wipes the env. Instead:
```bash
cd /home/claude/dev/lifelup-agent
pm2 delete lifelup-coach && pm2 start ecosystem.config.cjs && pm2 save
```

## Convex Deploy
```bash
# From /home/claude/dev/lifelUp — full admin key is required
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

Convex deploy automatically regenerates `convex/_generated/` bindings.
However, **`_generated/api.d.ts` must be manually updated** before `npm run build` when adding new `convex/*.ts` modules — add the import and entry to `fullApi`. The file is committed to git.

## Convex Docker — Critical Config
File: `/opt/convex/.env`
```
INSTANCE_NAME=convex-self-hosted
INSTANCE_SECRET=071f42fc...
RUST_LOG=info
CONVEX_CLOUD_ORIGIN=https://convex.aidigitalassistant.cloud
CONVEX_SITE_ORIGIN=https://convex.aidigitalassistant.cloud
```

Both `CONVEX_CLOUD_ORIGIN` and `CONVEX_SITE_ORIGIN` must equal the public Convex URL.
Without them, JWT `iss` is empty → every auth query fails with `NoAuthProvider`.

```bash
# Restart Convex Docker
cd /opt/convex && sudo docker compose down && sudo docker compose up -d

# Verify JWT issuer is set correctly:
curl https://convex.aidigitalassistant.cloud/.well-known/openid-configuration
# Must return: {"issuer":"https://convex.aidigitalassistant.cloud",...}
```

## Convex Runtime Env Vars
```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex env set JWT_PRIVATE_KEY "-----BEGIN PRIVATE KEY-----..."
npx convex env set JWKS '{"keys":[...]}'
npx convex env set SITE_URL https://lifelup.aidigitalassistant.cloud
npx convex env set AGENT_SECRET de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4
```

## Nginx Routing
- `/` → port 3210 (Convex sync engine, WebSocket + HTTP)
- `/agent/` → port 3211 (Convex HTTP actions)
- `/.well-known/` → port 3211 (OIDC/JWKS endpoints)

Config: `/etc/nginx/sites-enabled/convex`

## Remote Triggers (Scheduled Agents)
| ID | Name | Schedule | Purpose |
|----|------|----------|---------|
| `trig_01DaqJv1vsw4EfKR9UQgmaAV` | `lifelup-goals-agent` | `0 0 * * *` (daily midnight UTC) | Extract goals from coach conversations |
| `trig_018kynNqXtsXR8bwLQNXF7rV` | `lifelup-context-agent` | `0 2 * * 0` (weekly Sunday 2am UTC) | Extract context facts from coach conversations |

Run a trigger immediately for testing: use `RemoteTrigger` tool with `action: "run"`.

Manage at: https://claude.ai/code/scheduled

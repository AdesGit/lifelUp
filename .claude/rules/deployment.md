---
paths:
  - ".github/**"
  - "ecosystem.config.js"
  - "scripts/**"
---

# Deployment Conventions

## VPS Info
- **IP**: 72.62.129.117 (Hostinger, Ubuntu 24.04)
- **User**: claude (sudo NOPASSWD)
- **App dir**: `/var/www/lifelup/`
- **Convex dir**: `/opt/convex/`
- **PM2 config**: `/var/www/lifelup/ecosystem.config.js`

## Production Deploy (manual)
```bash
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
pm2 save
```

## Convex Docker — Critical Config
File: `/opt/convex/.env`
```
INSTANCE_NAME=convex-self-hosted
INSTANCE_SECRET=071f42fc...
RUST_LOG=info
CONVEX_CLOUD_ORIGIN=https://convex.aidigitalassistant.cloud
CONVEX_SITE_ORIGIN=https://convex.aidigitalassistant.cloud
```

The Docker startup script (`run_backend.sh`) maps these to:
- `CONVEX_CLOUD_ORIGIN` → `--convex-origin` (Convex API URL)
- `CONVEX_SITE_ORIGIN` → `--convex-site` (JWT issuer URL)

Both must equal `https://convex.aidigitalassistant.cloud` for auth to work.

### Restart Convex Docker
```bash
cd /opt/convex
sudo docker compose down && sudo docker compose up -d
# Verify issuer is set:
curl https://convex.aidigitalassistant.cloud/.well-known/openid-configuration
```

## CI/CD (GitHub Actions)
File: `.github/workflows/deploy.yml`
- Triggers on push to `main`
- SSHs into VPS, runs `git pull && npm ci && npm run build && pm2 restart`

Required GitHub Secrets:
| Secret | Value |
|--------|-------|
| `VPS_HOST` | `72.62.129.117` |
| `VPS_USER` | `claude` |
| `VPS_SSH_KEY` | VPS private key (`cat ~/.ssh/id_rsa` on VPS) |

## Convex Runtime Env Vars (set via CLI)
```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex env set JWT_PRIVATE_KEY "-----BEGIN PRIVATE KEY----- ..."
npx convex env set JWKS '{"keys":[...]}'
npx convex env set SITE_URL https://lifelup.aidigitalassistant.cloud
```

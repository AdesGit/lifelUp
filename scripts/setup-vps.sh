#!/usr/bin/env bash
# Run this ONCE on the VPS to set up the app.
# Usage: bash scripts/setup-vps.sh
set -e

REPO="git@github.com:AdesGit/lifelUp.git"
APP_DIR="/var/www/lifelup"
CONVEX_URL="http://localhost:3210"
CONVEX_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d"

echo "=== 1. Remove old app and clone fresh ==="
sudo rm -rf "$APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown claude:claude "$APP_DIR"
git clone "$REPO" "$APP_DIR"
cd "$APP_DIR"

echo "=== 2. Write .env.production ==="
cat > .env.production << 'EOF'
NEXT_PUBLIC_CONVEX_URL=https://convex.aidigitalassistant.cloud
NODE_ENV=production
EOF

echo "=== 3. Install dependencies ==="
npm ci --production=false

echo "=== 4. Generate JWT keys for Convex Auth ==="
node -e "
const { generateKeyPair, exportPKCS8, exportJWK } = require('jose');
generateKeyPair('RS256', { extractable: true }).then(async keys => {
  const priv = await exportPKCS8(keys.privateKey);
  const pub = await exportJWK(keys.publicKey);
  const privateKey = priv.trim().replace(/\n/g, ' ');
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...pub }] });
  console.log('');
  console.log('=== COPY THESE VALUES ===');
  console.log('JWT_PRIVATE_KEY=' + privateKey);
  console.log('JWKS=' + jwks);
  console.log('=========================');
  console.log('');
  // Auto-set in Convex
  const { execSync } = require('child_process');
  const env = 'CONVEX_SELF_HOSTED_URL=$CONVEX_URL CONVEX_SELF_HOSTED_ADMIN_KEY=$CONVEX_ADMIN_KEY';
  execSync(env + ' npx convex env set JWT_PRIVATE_KEY \"' + privateKey + '\"', { stdio: 'inherit' });
  execSync(env + ' npx convex env set JWKS \'' + jwks + '\'', { stdio: 'inherit' });
  console.log('JWT keys set in Convex.');
});
" || {
  echo ""
  echo "Auto-set failed. Set JWT keys manually:"
  echo "  CONVEX_SELF_HOSTED_URL=$CONVEX_URL \\"
  echo "  CONVEX_SELF_HOSTED_ADMIN_KEY=$CONVEX_ADMIN_KEY \\"
  echo "  npx convex env set JWT_PRIVATE_KEY \"<key>\""
}

echo "=== 5. Deploy Convex functions ==="
CONVEX_SELF_HOSTED_URL="$CONVEX_URL" \
CONVEX_SELF_HOSTED_ADMIN_KEY="$CONVEX_ADMIN_KEY" \
npx convex deploy

echo "=== 6. Build Next.js ==="
npm run build

echo "=== 7. Start with PM2 ==="
pm2 delete lifelup 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=== Done! App running at https://lifelup.aidigitalassistant.cloud ==="
echo "Check: pm2 logs lifelup"

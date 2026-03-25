# LifeLup System Health Check

Run this after any significant change to verify the full system is healthy.
Each check is independent — run all of them, don't stop at the first failure.

---

## 1. TypeScript Build

```bash
cd /home/claude/dev/lifelUp
npm run build 2>&1 | tail -30
```

**Expected:** `✓ Compiled successfully` or `Route (app)` table with no errors
**Failure means:** TypeScript error in app code. Check for missing api.d.ts update or wrong import paths.

---

## 2. ESLint

```bash
cd /home/claude/dev/lifelUp
npm run lint 2>&1 | tail -20
```

**Expected:** Zero warnings, zero errors
**Failure means:** Unused variable, missing dependency in useEffect, or other lint rule. Fix before deploying.

---

## 3. Convex Deploy (schema + function validation)

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

**Expected:** All functions deployed, no schema errors
**Failure means:** TypeScript error in convex/ code, or schema conflict. Fix and redeploy.
**Note:** Run this after ANY change to `convex/schema.ts` or any `convex/*.ts` file.

---

## 4. JWT Issuer Check

Verifies that Convex is correctly configured to issue JWTs with the right `iss` claim.
If this is wrong, ALL authenticated queries fail with `NoAuthProvider`.

```bash
curl -s https://convex.aidigitalassistant.cloud/.well-known/openid-configuration \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('issuer:', d['issuer'])"
```

**Expected:** `issuer: https://convex.aidigitalassistant.cloud`
**Failure means:** `CONVEX_SITE_ORIGIN` is wrong in `/opt/convex/.env`. See Convex Docker env docs.

---

## 5. Agent Endpoint Auth Check

Verifies that all `/agent/v1/*` endpoints correctly enforce Bearer token auth.

```bash
# Must return 401:
echo -n "Wrong token test: "
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/pending

# Must return valid JSON:
echo "Correct token test:"
curl -s \
  -H "Authorization: Bearer de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4" \
  https://convex.aidigitalassistant.cloud/agent/v1/pending \
  | python3 -m json.tool | head -5
```

**Expected:** First: `401`. Second: valid JSON (array, even if empty `[]`).
**Failure means:** `verifyAgentSecret` helper is broken, or AGENT_SECRET env var not set in Convex.

---

## 6. Coach Agent Health

```bash
pm2 logs lifelup-coach --lines 30 --nostream
```

**Expected:** Recent timestamps, `[coach-poll] Started` message, no `ERROR` lines
**Failure means:** Check ANTHROPIC_API_KEY is still set (`pm2 env 2 | grep ANTHROPIC`).
If key is gone: `pm2 delete lifelup-coach && pm2 start /home/claude/dev/lifelup-agent/ecosystem.config.cjs && pm2 save`

---

## 7. Production App Response

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lifelup.aidigitalassistant.cloud
```

**Expected:** `200`
**Failure means:** PM2 process is down, or Next.js build is broken. Check `pm2 list` and `pm2 logs lifelup`.

---

## 8. PM2 Process Status

```bash
pm2 list
```

**Expected:**
- `lifelup` (id=0): `online`, port 3000
- `lifelup-coach` (id=2): `online`

**Failure means:** Process crashed. Check `pm2 logs [name]` for the crash reason.

---

## Full Run (copy-paste)

```bash
cd /home/claude/dev/lifelUp && \
echo "=== 1. Build ===" && npm run build 2>&1 | tail -5 && \
echo "=== 2. Lint ===" && npm run lint 2>&1 | tail -5 && \
echo "=== 3. JWT Issuer ===" && \
curl -s https://convex.aidigitalassistant.cloud/.well-known/openid-configuration \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('issuer:', d['issuer'])" && \
echo "=== 4. Agent Auth ===" && \
curl -s -o /dev/null -w "wrong token → %{http_code}\n" \
  -H "Authorization: Bearer wrongtoken" \
  https://convex.aidigitalassistant.cloud/agent/v1/pending && \
echo "=== 5. PM2 ===" && pm2 list && \
echo "=== 6. App ===" && \
curl -s -o /dev/null -w "app → %{http_code}\n" https://lifelup.aidigitalassistant.cloud
```

---

## After Major Changes

After adding a new page: also verify sign-out and sign-in redirect flow manually in a browser.
After changing schema: always run Step 3 (Convex deploy) even if the TypeScript build passes.
After changing coach-poll.mjs: restart the agent with delete+start cycle (see CLAUDE.md Gotcha #4).

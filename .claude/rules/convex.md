---
paths:
  - "convex/**/*.ts"
---

# Convex Backend Conventions

## Schema
Always spread `authTables` first, then add app tables:
```typescript
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,
  users: defineTable({ ... }).index("email", ["email"]),
  todos: defineTable({ userId: v.id("users"), text: v.string(), completed: v.boolean() })
    .index("by_user", ["userId"]),
});
```

## Auth Setup
```typescript
// convex/auth.ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

## auth.config.ts — Critical Pattern
```typescript
// CONVEX_SITE_URL is a Convex built-in auto-set from CONVEX_SITE_ORIGIN in Docker env.
// Use || (not ??) because it's "" (empty string) during CLI deploy evaluation, not undefined.
const authConfig = {
  providers: [{
    domain: process.env.CONVEX_SITE_URL || "https://convex.aidigitalassistant.cloud",
    applicationID: "convex",
  }],
};
export default authConfig;
```
⚠️ The domain must match the JWT `iss` claim. The issuer is set by `CONVEX_SITE_ORIGIN`
in `/opt/convex/.env`. If that's wrong, you get `NoAuthProvider` errors on every query.

## HTTP Router
Always call `auth.addHttpRoutes(http)` — required for `/.well-known/openid-configuration`
and `/.well-known/jwks.json` to be served (needed for JWT verification):
```typescript
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```

## Authenticated Queries/Mutations
```typescript
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.get(userId);
  },
});
```

## Argument Validators
Always use `v` validators:
```typescript
import { v } from "convex/values";

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("todos", { userId, text, completed: false });
  },
});
```

## Testing Auth via HTTP (useful for debugging)
```bash
# Sign up
curl -X POST "https://convex.aidigitalassistant.cloud/api/run/auth/signIn" \
  -H "Content-Type: application/json" \
  -d '{"args":{"provider":"password","params":{"email":"x@x.com","password":"pass123","flow":"signUp"}}}'

# Decode JWT issuer (should be https://convex.aidigitalassistant.cloud)
# Take token from response, split by '.', base64-decode middle part

# Check OIDC issuer
curl https://convex.aidigitalassistant.cloud/.well-known/openid-configuration
# Must return: {"issuer":"https://convex.aidigitalassistant.cloud",...}
```

## Self-Hosted Deploy
```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy
```
After schema changes: Convex will show added/deleted indexes — verify before continuing.

## Known Gotchas

### `||` vs `??` in auth.config.ts — do not change this
`process.env.CONVEX_SITE_URL` is set to `""` (empty string) by the Convex runtime during CLI deploy evaluation — not `undefined`. The `??` operator only guards against `null`/`undefined`, so using `??` would pass the empty string through → JWT `iss: ""` → `NoAuthProvider` error on every authenticated query. Always use `||`.

### api.d.ts — 3-step manual update when adding a new module
1. Add `import type * as newmodule from "../newmodule.js";` at the top of `convex/_generated/api.d.ts`
2. Add `newmodule: typeof newmodule;` to the `fullApi` `ApiFromModules` declaration
3. Commit this change **before** running `npm run build`

The server regenerates the full file during `npx convex deploy`, but the local committed copy is what `npm run build` reads. Skipping this causes TypeScript errors like `Property 'newmodule' does not exist on type 'FilteredAPI<...>'`.

### HTTP Actions run on port 3211, not 3210
- Port 3210 = Convex sync engine (WebSocket + standard HTTP API)
- Port 3211 = Convex HTTP actions (your `http.ts` handlers)

Nginx routes `/agent/` → 3211 on the Convex subdomain. When debugging with curl, use the public URL — Nginx handles the port routing.

### `internal.*` inside httpActions — never `api.*`
Inside `httpAction` handlers, always call `ctx.runQuery(internal.module.fn)` and `ctx.runMutation(internal.module.fn)`. Using `api.*` fails because HTTP actions don't have a user auth context. All agent-facing Convex functions must be `internalQuery` or `internalMutation`.

### Index naming convention
- Single field: `by_{field}` (e.g., `by_user`, `by_fingerprint`)
- Compound: `by_{field1}_{field2}` (e.g., `by_user_fingerprint`)
- The `by_user_fingerprint` compound index on `goals` enables efficient per-user upsert lookups without a full table scan.

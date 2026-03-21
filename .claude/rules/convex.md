---
paths:
  - "convex/**/*.ts"
---

# Convex Backend Conventions

## Schema
Always spread `authTables` first, then add app tables:
```typescript
import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

const schema = defineSchema({
  ...authTables,
  // app tables here
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

## HTTP Router
Always call `auth.addHttpRoutes(http)` — required for sign-in/out to work:
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
Always use `v` validators — never skip them:
```typescript
import { v } from "convex/values";

export const createItem = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => { ... },
});
```

## Self-Hosted Deploy
```bash
CONVEX_SELF_HOSTED_URL=http://localhost:3210 \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f268..." \
npx convex deploy
```

---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
---

# Frontend Conventions (Next.js App Router)

## Client vs Server Components
- Default: Server Components (no `"use client"`)
- Add `"use client"` only when using hooks, browser APIs, or Convex hooks
- Never use `useConvexAuth()` or `useAuthActions()` in server components

## Auth State in Client Components
```typescript
"use client";
import { useConvexAuth } from "convex/react";

export function ProtectedComponent() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return null;
  return <div>...</div>;
}
```

## Auth Actions
```typescript
"use client";
import { useAuthActions } from "@convex-dev/auth/react";

// Sign in
const { signIn } = useAuthActions();
await signIn("password", formData);

// Sign out
const { signOut } = useAuthActions();
await signOut();
```

## Provider Setup (layout.tsx)
`ConvexAuthProvider` must wrap the entire app — it must be a client component:
```typescript
// components/ConvexClientProvider.tsx
"use client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
```

## Tailwind
- Use Tailwind utility classes only — no inline styles
- Dark mode: `dark:` prefix, dark mode enabled via `class` strategy
- Responsive: mobile-first (`sm:`, `md:`, `lg:`)

## Page Protection Pattern
```typescript
"use client";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;
  return <div>Protected content</div>;
}
```

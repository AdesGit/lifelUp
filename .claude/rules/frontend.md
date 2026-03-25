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

## Anti-Patterns

- **Never** import from `convex/todos`, `convex/goals`, etc. directly in client components — always use `@/convex/_generated/api`
- **Never** use `useConvexAuth()` or `useQuery()` in server components (no `"use client"`) — they throw
- **Never** use `style={{}}` inline styles — use Tailwind utility classes, even for dynamic values (conditional class strings)
- **Never** render page content before checking `isAuthenticated` — always show spinner or return null while loading
- **Never** use `useEffect` for data fetching — use `useQuery()` which handles real-time updates automatically
- **Never** create component files in `app/` — components go in `components/`, pages in `app/`

## Page Checklist

Every new protected page must have all of the following:
- [ ] `"use client"` directive at top of file
- [ ] `useConvexAuth()` with `useEffect` redirect to `/signin`
- [ ] Loading spinner while `isLoading || !isAuthenticated` (copy from `app/goals/page.tsx`)
- [ ] Navigation header identical to other pages (copy verbatim from `app/goals/page.tsx` header)
- [ ] `<SignOutButton />` in the header
- [ ] Active nav item highlighted (current page uses `text-blue-600` instead of `text-gray-500`)

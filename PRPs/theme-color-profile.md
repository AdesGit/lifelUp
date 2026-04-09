# PRP: Theme Color Profile Page

> Stack: Next.js 15 App Router · Convex self-hosted · @convex-dev/auth · Tailwind CSS
> Source: filled from `INITIAL.md` via `/generate-prp`
> See completed example: `PRPs/EXAMPLE_goals_agent.md`

---

## Overview

Add a `/profile` page where each authenticated family member can pick a personal theme color from a palette of 9 predefined colors. The chosen color is persisted in the `users` table as `themeColor` and replaces the index-based `COLORS` array in `/family`, so avatars, tabs, and todo completion indicators all reflect each user's own color.

---

## Success Criteria

- [ ] A `/profile` page is accessible from the nav (link added to all pages that share the header)
- [ ] The page displays the current user's name, email, level, total stars, and the 9-color palette
- [ ] The active color is visually indicated (ring/check overlay) on the palette swatch
- [ ] Clicking a swatch immediately calls `updateThemeColor` and the change persists after page reload
- [ ] The `users` table has a `themeColor: v.optional(v.string())` field
- [ ] `/family` view reads `user.themeColor` via `THEME_COLORS` lookup instead of the index-based `COLORS` array; fallback is `bg-blue-500`
- [ ] All Tailwind color classes are listed as complete strings in the `THEME_COLORS` lookup (no template literals)
- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero ESLint warnings)
- [ ] Unauthenticated users redirected to `/signin`
- [ ] Manual verification: choose a color on `/profile`, reload, visit `/family` — avatar and tab reflect the chosen color

---

## Context Files to Read Before Implementing

- `convex/schema.ts` — current `users` table definition (add `themeColor` field here)
- `convex/_generated/api.d.ts` — `users` module already imported; no new module needed, just verify `users` entry is present
- `convex/users.ts` — existing `getMe` query + `updateProfile` mutation (add `updateThemeColor` alongside)
- `convex/todos.ts` — `listAll` query: confirm the `user: userMap[todo.userId]` spread includes all user fields (it does — full user object is returned); `themeColor` will be present automatically after schema change
- `app/family/page.tsx` — current `COLORS` array + index-based assignment to replace
- `examples/app-page.tsx` — protected page skeleton with exact nav header pattern

---

## Affected Files

| File | Action | Notes |
|------|--------|-------|
| `convex/schema.ts` | Modify | Add `themeColor: v.optional(v.string())` to `users` table |
| `convex/users.ts` | Modify | Add `updateThemeColor` mutation |
| `app/profile/page.tsx` | Create | Protected profile page with color picker |
| `app/family/page.tsx` | Modify | Replace `COLORS` array + index logic with `THEME_COLORS` lookup |
| All nav-bearing pages (see Task 5) | Modify | Add "Profile" link to nav header |

> No new Convex module → no `api.d.ts` change required. `users` is already declared.

---

## Tasks

### Task 1: Schema — add `themeColor` to `users`
**File:** `convex/schema.ts`
**Action:** Modify
**Depends on:** nothing

Add `themeColor: v.optional(v.string())` to the `users` `defineTable({...})` block, after the existing `ballejauneLogin` field:

```typescript
ballejauneLogin: v.optional(v.string()),  // e.g. "GALL Christian"
themeColor: v.optional(v.string()),       // palette id: "blue" | "violet" | ... fallback "blue"
```

No new index needed — theme color is always accessed via the user object, not queried directly.

---

### Task 2: Convex mutation — `updateThemeColor`
**File:** `convex/users.ts`
**Action:** Modify — add mutation after `updateProfile`
**Depends on:** Task 1

```typescript
export const updateThemeColor = mutation({
  args: { themeColor: v.string() },
  handler: async (ctx, { themeColor }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.patch(userId, { themeColor });
  },
});
```

Note: uses `getAuthUserId(ctx)` (not `identity.email`) — consistent with existing `updateProfile` pattern and avoids the `??` / `||` pitfall.

---

### Task 3: Profile page
**File:** `app/profile/page.tsx`
**Action:** Create
**Depends on:** Task 2

```typescript
"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

// All 9 colors as complete Tailwind class strings — never use template literals
const THEME_COLORS = [
  { id: "blue",   bg: "bg-blue-500",   label: "Bleu"   },
  { id: "violet", bg: "bg-violet-500", label: "Violet" },
  { id: "pink",   bg: "bg-pink-500",   label: "Rose"   },
  { id: "green",  bg: "bg-green-500",  label: "Vert"   },
  { id: "orange", bg: "bg-orange-500", label: "Orange" },
  { id: "red",    bg: "bg-red-500",    label: "Rouge"  },
  { id: "cyan",   bg: "bg-cyan-500",   label: "Cyan"   },
  { id: "yellow", bg: "bg-yellow-500", label: "Jaune"  },
  { id: "indigo", bg: "bg-indigo-500", label: "Indigo" },
];

function computeLevel(totalStars: number): number {
  return Math.floor(Math.sqrt(totalStars / 5)) + 1;
}

export default function ProfilePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const me = useQuery(api.users.getMe);
  const updateThemeColor = useMutation(api.users.updateThemeColor);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const activeColor = me?.themeColor ?? "blue";
  const level = computeLevel(me?.totalStars ?? 0);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* Nav header — copy verbatim from family/page.tsx, set Profile as active */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">My todos</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Family</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Coach</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Goals</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Context</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Recurring</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Fichiers</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Quests</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/calendar" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Calendrier</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos-board" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Todos Board</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Dashboard</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/screen-time" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Screen Time</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/ballejaune" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Padel</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/agents" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Agents</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/integrations" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Intégrations</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Profile</span>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8 pt-6 sm:pt-10 max-w-lg mx-auto w-full">
        {me === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {me && (
          <div className="w-full space-y-6">
            {/* User info card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full ${THEME_COLORS.find(c => c.id === activeColor)?.bg ?? "bg-blue-500"} flex items-center justify-center text-white text-lg font-bold flex-shrink-0`}>
                {(me.email ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {me.firstName && me.lastName ? `${me.firstName} ${me.lastName}` : (me.email ?? "")}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{me.email}</p>
                <p className="text-xs text-yellow-500 font-medium mt-0.5">
                  Niveau {level} · {me.totalStars ?? 0} ⭐
                </p>
              </div>
            </div>

            {/* Color picker */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Couleur de thème</h2>
              <div className="grid grid-cols-9 gap-2">
                {THEME_COLORS.map(({ id, bg, label }) => (
                  <button
                    key={id}
                    title={label}
                    onClick={() => updateThemeColor({ themeColor: id })}
                    className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 ${
                      id === activeColor ? "ring-2 ring-offset-2 ring-gray-700 dark:ring-gray-300 scale-110" : ""
                    }`}
                    aria-label={label}
                    aria-pressed={id === activeColor}
                  >
                    {id === activeColor && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Cette couleur sera utilisée pour votre avatar et vos indicateurs dans la vue Famille.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

---

### Task 4: Update `/family` — replace `COLORS` array with `THEME_COLORS` lookup
**File:** `app/family/page.tsx`
**Action:** Modify
**Depends on:** Task 1 (schema change means `user.themeColor` is now available in `listAll` join)

**Step A — Replace the `COLORS` array with `THEME_COLORS` lookup:**

Remove:
```typescript
const COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
];
```

Add:
```typescript
// Complete Tailwind classes — never build these with template literals (Tailwind 4 purging)
const THEME_COLORS: Record<string, string> = {
  blue:   "bg-blue-500",
  violet: "bg-violet-500",
  pink:   "bg-pink-500",
  green:  "bg-green-500",
  orange: "bg-orange-500",
  red:    "bg-red-500",
  cyan:   "bg-cyan-500",
  yellow: "bg-yellow-500",
  indigo: "bg-indigo-500",
};

function getThemeColor(themeColor?: string | null): string {
  return THEME_COLORS[themeColor ?? ""] ?? "bg-blue-500";
}
```

**Step B — Replace index-based color lookups:**

The `listAll` join already spreads the full user object (including `themeColor`) into `todo.user`. The `todos` data structure is `Todo & { user: User | null }`.

In the tab bar loop (line ~177–199), replace:
```typescript
const color = COLORS[i % COLORS.length];
```
with:
```typescript
const color = getThemeColor(userTodos[0]?.user?.themeColor);
```

Remove the `selectedIndex` / `selectedColor` calculation block (lines ~83–84):
```typescript
const selectedIndex = users.findIndex((u) => u.email === effectiveEmail);
const selectedColor = selectedIndex >= 0 ? COLORS[selectedIndex % COLORS.length] : COLORS[0];
```

Replace with:
```typescript
const selectedColor = getThemeColor(selectedUser?.todos[0]?.user?.themeColor);
```

(Place this inside the rendering block after `selectedUser` is resolved, or compute it earlier using the joined user data from `selectedUser?.todos[0]?.user?.themeColor`.)

**Step C — Add "Profile" link to the nav header in `/family`:**

After the existing "Intégrations" nav entry, add:
```tsx
<span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
<Link href="/profile" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
  Profile
</Link>
```

---

### Task 5: Add "Profile" nav link to other pages
**Action:** Modify nav headers in other pages that share the same header
**Depends on:** Task 3

Pages to update (add `· Profile` link at end of nav):
- `app/page.tsx` (home / My todos)

All other pages should also eventually have the link, but at minimum add it to `app/page.tsx` and `app/family/page.tsx` (handled in Task 4). Check the full list of pages in `app/` and add the Profile link to any that have a nav header.

Pages to audit: `app/coach/page.tsx`, `app/goals/page.tsx`, `app/context/page.tsx`, `app/todos/recurring/page.tsx`, `app/quests/page.tsx`, `app/calendar/page.tsx`, `app/todos-board/page.tsx`, `app/dashboard/page.tsx`.

---

### Task 6: Build validation
**Action:** Run
**Depends on:** Tasks 1–5

```bash
cd /home/ades/dev/lifelUp
npm run build
npm run lint
```

Fix any TypeScript or ESLint errors before proceeding.

---

### Task 7: Convex deploy
**Action:** Run
**Depends on:** Task 6

```bash
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy
```

Watch for: schema migration adding `themeColor` to `users` table. No index changes.

---

## Validation Sequence

```bash
# 1. TypeScript build
npm run build 2>&1 | tail -20

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. Convex deploy (schema + mutation)
CONVEX_SELF_HOSTED_URL=https://convex.aidigitalassistant.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01c9f2684963896109a7cd7da2420d0ef20298c454acc676a6eb214b76cf6587a32f56b98d" \
npx convex deploy

# 4. Manual verification
# a) Visit https://lifelup.aidigitalassistant.cloud/profile
#    → Page loads, shows name/email/level/stars
#    → 9 color swatches visible, active color has ring/check
#    → Click a different color → swatch updates immediately
# b) Reload /profile → chosen color still selected (persisted in DB)
# c) Visit https://lifelup.aidigitalassistant.cloud/family
#    → User tabs show avatar with selected theme color
#    → Todo completion dot uses the same color
# d) Sign out → redirected to /signin

# 5. Production deploy (manual — GitHub Actions is broken)
cd /var/www/lifelup
git pull origin main
npm ci --production=false
npm run build
pm2 restart lifelup
```

---

## Known Risks

- **Tailwind 4 purging** — dynamic class strings (`bg-${id}-500`) are NOT safe. All Tailwind color classes must be written as complete strings in the `THEME_COLORS` lookup. This is already addressed in the implementation above.
- **`users` table spread in `listAll`** — `themeColor` will be present automatically once the schema is updated and Convex is redeployed; no change needed to `convex/todos.ts`.
- **`selectedColor` refactor in family/page.tsx** — the current code derives `selectedColor` from `selectedIndex` before the user details are rendered. The refactored version must derive it from `selectedUser?.todos[0]?.user?.themeColor` — verify the computed value is in scope when used in both the tab bar and the selected user card.
- **No `api.d.ts` change needed** — `users` module is already declared. Adding a mutation to an existing module does not require touching `api.d.ts`.
- **`||` not `??` for env vars** — already handled in `auth.config.ts`; no new env var usage in this feature.

---

## Confidence Score

**Score:** 9/10
**Reason:** All layers are well-understood. The `listAll` join already returns full user objects so `themeColor` flows to the family view with zero query changes. The mutation pattern is identical to `updateProfile`. The only mildly risky step is the `selectedColor` variable scope refactor in `family/page.tsx` — the detailed notes in Task 4 mitigate that. Score would be 10/10 if the nav header weren't duplicated across 10+ pages (updating all of them is mechanical but tedious).

# Feature Request: Full Frontend Responsive Design

---

## What (Goal)
Make the entire LifeLup frontend fully responsive so the app works well on mobile devices (320px–768px), tablets (768px–1024px), and desktops (1024px+). Currently, all pages share a broken navigation header that overflows on small screens, and paddings/layouts are fixed without mobile breakpoints.

## Who Uses It
- [x] Single user (authenticated, per-user data) — uses the app on mobile phone
- [x] All family members — family members likely access from various devices including phones

## Success Criteria
- [ ] Navigation header works on all screen sizes — either collapses to a compact/scrollable format on mobile or uses a hamburger menu
- [ ] All page containers use responsive padding: `p-4 sm:p-8` instead of fixed `p-8`
- [ ] All cards use responsive padding: `p-3 sm:p-5`
- [ ] TodoList form (input + submit button) stacks vertically on mobile: `flex-col sm:flex-row`
- [ ] Recurring todo form controls (frequency selector + time input) stack on mobile
- [ ] Family page tabs scroll horizontally and labels truncate properly on mobile
- [ ] Coach page message bubbles are readable on mobile (correct max-width)
- [ ] Context page modal and textarea are usable on mobile (`rows={3} sm:rows={5}`)
- [ ] Sign-in page is properly centered and padded on mobile
- [ ] App builds without TypeScript errors (`npm run build`)
- [ ] Lint passes with zero warnings (`npm run lint`)
- [ ] Manual check on 375px width (iPhone SE viewport) — no horizontal scrolling, no overflowing elements

## Layers Affected
- [ ] Next.js pages (all pages in `app/` directory — 7 pages total)
- [ ] React components (`components/TodoList.tsx`, `components/SignInForm.tsx`, `components/SignOutButton.tsx`, `components/PushNotificationButton.tsx`)
- [ ] No Convex schema changes
- [ ] No new agent scripts
- [ ] No new pages

## Specific Issues to Fix (per file)

### Navigation Header (shared across all pages)
All pages repeat the same header pattern. Issues:
- `px-6 py-4` → `px-4 sm:px-6 py-3 sm:py-4`
- Navigation links: 7 items with `·` separators overflow on mobile (<640px)
- Fix: On mobile, convert nav to a horizontal scroll with `overflow-x-auto` and smaller `text-xs` links, or use a bottom navigation bar pattern
- Stars display in header: `flex items-center gap-2` — ensure it doesn't get cut off

### `app/page.tsx` (Home/My Todos)
- Header: responsive padding
- Nav: horizontal scroll or collapse
- Page container: `p-8 pt-10` → `p-4 sm:p-8 sm:pt-10`

### `app/goals/page.tsx`
- Header: responsive padding
- Nav: same fix
- Container: `p-8` → `p-4 sm:p-8`
- Goal cards: `p-5` → `p-3 sm:p-5`

### `app/family/page.tsx`
- Header: responsive padding
- Nav: same fix
- Container: `p-8 pt-10` → `p-4 sm:p-8 sm:pt-10`
- Tab bar: already has `overflow-x-auto` ✓ — add `truncate max-w-[120px]` on tab labels
- Tab buttons: `px-4 py-3` → `px-3 py-2 sm:px-4 sm:py-3`
- Cards: `p-5` → `p-3 sm:p-5`
- List item: `pl-11` → `pl-8 sm:pl-11`

### `app/context/page.tsx`
- Header: responsive padding
- Nav: same fix
- Container: `p-8 pt-10` → `p-4 sm:p-8 sm:pt-10`
- Modal: `p-6` → `p-4 sm:p-6`
- Textarea: `rows={5}` → `rows={3}`

### `app/quests/page.tsx`
- Header: responsive padding
- Nav: same fix
- Container: `p-8 pt-10` → `p-4 sm:p-8 sm:pt-10`
- Quest cards: `p-5` → `p-3 sm:p-5`

### `app/coach/page.tsx`
- Header: responsive padding
- Nav: same fix
- Message bubbles: `max-w-[80%]` → `max-w-[85%] sm:max-w-[75%]`
- Input area: responsive padding

### `app/signin/page.tsx`
- Container: `p-8` → `p-4 sm:p-8`
- Emoji heading: `text-5xl` → `text-4xl sm:text-5xl`

### `app/todos/recurring/page.tsx`
- Header: responsive padding
- Nav: same fix
- Container: `p-8 pt-10 gap-6` → `p-4 sm:p-8 sm:pt-10 gap-4 sm:gap-6`
- Form controls: add `flex-col sm:flex-row` for frequency/time row

### `components/TodoList.tsx`
- Input + submit button row: `flex gap-2` → `flex flex-col sm:flex-row gap-2`
- Recurring toggle row (frequency select + time input + UTC): `flex items-center gap-2 flex-1` → wrap with `flex-col sm:flex-row`

### `components/SignInForm.tsx`
- Heading: `text-2xl` → `text-xl sm:text-2xl`

## Navigation Strategy Choice
**Approach A — Horizontal scroll nav (simpler, no JS):**
- Wrap nav in `overflow-x-auto` scrollable container
- Use `text-xs sm:text-sm` for nav links
- Use `gap-2 sm:gap-3` between links
- Remove `·` separators, use `flex gap` instead
- Pros: No new components, no JS state, fast

**Approach B — Bottom navigation bar on mobile:**
- Show bottom bar with icons on mobile, hide top nav
- Pros: Native mobile UX
- Cons: More complex, needs icons per page, new component

**Preferred: Approach A** — Keep it simple for MVP. Scrollable nav with smaller text and reduced gaps on mobile.

## Most Similar Existing Feature
- All existing pages follow the same header/nav pattern — fix it once per page
- `app/family/page.tsx` already uses `overflow-x-auto` for tabs — use same pattern for nav

## Out of Scope
- No hamburger menu (Approach B rejected for MVP simplicity)
- No dark mode
- No animation or transition changes
- No layout restructuring — same visual hierarchy, just responsive
- No changes to Convex backend
- No changes to agent scripts

## Additional Context
- Target breakpoint: `sm` = 640px (Tailwind default). Mobile = <640px.
- Test viewport: 375px wide (iPhone SE / most Android phones)
- The app is used by a small family — mobile use is real and current
- Navigation has 7 items: Accueil · Coach · Objectifs · Famille · Contexte · Récurrents · Quêtes — plus ⭐ total and Sign Out button
- All pages are "use client" components (hooks used everywhere)

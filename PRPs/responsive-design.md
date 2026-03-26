# PRP: Full Frontend Responsive Design

## Overview
Make every LifeLup page and component fully responsive so the app works correctly on mobile (320px+), tablet, and desktop. The fix targets navigation overflow, fixed paddings, and non-wrapping flex layouts — no new Convex tables, agents, or pages required.

---

## Success Criteria
- [ ] Navigation header does not overflow or cause horizontal scroll on 375px viewport
- [ ] All page containers use responsive padding: `p-4 sm:p-8` / `pt-6 sm:pt-10`
- [ ] All cards use responsive padding: `p-3 sm:p-5`
- [ ] TodoList form (input + submit button) stacks vertically on mobile (`flex-col sm:flex-row`)
- [ ] Recurring controls row (frequency + time + UTC) wraps on mobile (`flex-wrap`)
- [ ] Family page tab labels truncate and don't break layout on mobile
- [ ] Coach page message bubbles readable on mobile (max-w adjusted)
- [ ] Context modal usable on mobile (responsive padding, `rows={3}`)
- [ ] Sign-in page properly padded and sized on mobile
- [ ] `npm run build` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint warnings
- [ ] Manual check: open `https://lifelup.aidigitalassistant.cloud` at 375px — no horizontal scroll anywhere

---

## Context Files to Read Before Implementing

```
app/page.tsx                    — canonical header/nav pattern (all pages copy this)
app/family/page.tsx             — tab bar with overflow-x-auto already in place
app/coach/page.tsx              — message bubbles max-w
app/context/page.tsx            — modal form with textarea rows
app/goals/page.tsx              — goal cards p-5
app/quests/page.tsx             — quest cards, nav with flex-wrap
app/signin/page.tsx             — centered sign-in page
app/todos/recurring/page.tsx    — recurring form controls layout
components/TodoList.tsx         — input+button row, recurring controls row
components/SignInForm.tsx       — title text size
examples/app-page.tsx           — canonical page pattern reference
```

---

## Affected Files

| File | Change Type | What Changes |
|------|-------------|--------------|
| `app/page.tsx` | modify | nav: scrollable + smaller text; container padding responsive |
| `app/family/page.tsx` | modify | nav; container padding; tab button padding; card padding; list item padding |
| `app/goals/page.tsx` | modify | nav; container padding; card padding |
| `app/coach/page.tsx` | modify | nav; message bubble max-w |
| `app/context/page.tsx` | modify | nav; container padding; modal padding; textarea rows |
| `app/quests/page.tsx` | modify | nav; container padding; card padding |
| `app/signin/page.tsx` | modify | container padding; emoji text size |
| `app/todos/recurring/page.tsx` | modify | nav; container padding; form controls wrapping |
| `components/TodoList.tsx` | modify | input+button row wrapping; recurring controls wrapping |
| `components/SignInForm.tsx` | modify | title text size |

**No Convex schema changes. No api.d.ts changes. No new files.**

---

## Navigation Strategy

Use **Approach A — horizontal scroll nav** (no JS, no new components):

**Current pattern (all pages):**
```tsx
<nav className="flex items-center gap-3 text-sm">
  <Link href="/">Accueil</Link>
  <span>·</span>
  <Link href="/coach">Coach</Link>
  ...
</nav>
```

**Responsive pattern:**
```tsx
<nav className="flex items-center gap-2 text-xs sm:text-sm overflow-x-auto">
  <Link href="/" className="whitespace-nowrap ...">Accueil</Link>
  <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
  <Link href="/coach" className="whitespace-nowrap ...">Coach</Link>
  ...
</nav>
```

Key changes per nav:
- `gap-3` → `gap-1.5 sm:gap-3`
- `text-sm` → `text-xs sm:text-sm`
- Add `overflow-x-auto` to nav wrapper
- Add `whitespace-nowrap` + `flex-shrink-0` to each link/separator

Header outer div gets `min-w-0` to allow flex child shrinking.

---

## Tasks

### Task 1 — Fix `app/page.tsx`
**File:** `app/page.tsx`
**depends-on:** none

Changes:
1. Header outer div: add `min-w-0` to the nav wrapper side
2. Nav: `gap-3 text-sm` → `gap-1.5 sm:gap-3 text-xs sm:text-sm overflow-x-auto`
3. Each nav `<Link>`: add `whitespace-nowrap flex-shrink-0`
4. Each separator `<span>`: add `flex-shrink-0`
5. Content wrapper: `p-8 pt-10` → `p-4 sm:p-8 pt-6 sm:pt-10`

Before:
```tsx
<header className="flex items-center justify-between px-6 py-4 border-b ...">
  <div className="flex items-center gap-2">
    <span className="text-xl font-bold ...">LifeLup</span>
  </div>
  <nav className="flex items-center gap-3 text-sm">
    <span className="text-blue-600 dark:text-blue-400 font-medium">Accueil</span>
    <span className="text-gray-300 dark:text-gray-600">·</span>
    <Link href="/coach" ...>Coach</Link>
    ...
  </nav>
  ...
</header>
...
<div className="flex flex-1 flex-col items-center gap-6 p-8 pt-10">
```

After:
```tsx
<header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b ...">
  <div className="flex items-center gap-2 flex-shrink-0">
    <span className="text-xl font-bold ...">LifeLup</span>
  </div>
  <nav className="flex items-center gap-1.5 sm:gap-3 text-xs sm:text-sm overflow-x-auto mx-2">
    <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Accueil</span>
    <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
    <Link href="/coach" className="... whitespace-nowrap">Coach</Link>
    ...
  </nav>
  ...
</header>
...
<div className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8 pt-6 sm:pt-10">
```

---

### Task 2 — Fix `app/family/page.tsx`
**File:** `app/family/page.tsx`
**depends-on:** Task 1 (same nav pattern)

Changes:
1. Same nav fix as Task 1
2. Content wrapper: `p-8 pt-10` → `p-4 sm:p-8 pt-6 sm:pt-10`
3. Tab buttons: `px-4 py-3` → `px-3 py-2 sm:px-4 sm:py-3`
4. Tab labels: add `max-w-[100px] sm:max-w-none truncate` to the label span
5. User card: `p-5` → `p-3 sm:p-5`
6. List item: `pl-11` → `pl-8 sm:pl-11`

---

### Task 3 — Fix `app/goals/page.tsx`
**File:** `app/goals/page.tsx`
**depends-on:** Task 1

Changes:
1. Same nav fix as Task 1
2. Content wrapper: `p-8 pt-10` → `p-4 sm:p-8 pt-6 sm:pt-10`; `gap-8` → `gap-6 sm:gap-8`
3. GoalCard container: `p-5` → `p-3 sm:p-5`

---

### Task 4 — Fix `app/coach/page.tsx`
**File:** `app/coach/page.tsx`
**depends-on:** Task 1

Changes:
1. Same nav fix as Task 1
2. Message bubble: `max-w-[80%]` → `max-w-[90%] sm:max-w-[75%]`
3. Input area outer padding: `p-4` → `p-3 sm:p-4`

---

### Task 5 — Fix `app/context/page.tsx`
**File:** `app/context/page.tsx`
**depends-on:** Task 1

Changes:
1. Same nav fix as Task 1
2. Content wrapper: `p-8 pt-10` → `p-4 sm:p-8 pt-6 sm:pt-10`; `gap-8` → `gap-6 sm:gap-8`
3. Modal: `p-6` → `p-4 sm:p-6`
4. Textarea: `rows={5}` → `rows={3}`
5. EntryCard: `p-5` → `p-3 sm:p-5`

---

### Task 6 — Fix `app/quests/page.tsx`
**File:** `app/quests/page.tsx`
**depends-on:** Task 1

Changes:
1. Same nav fix as Task 1
2. Content wrapper: `p-8 pt-10` → `p-4 sm:p-8 pt-6 sm:pt-10`; `gap-6` → `gap-4 sm:gap-6`
3. Quest card: `p-5` → `p-3 sm:p-5`

---

### Task 7 — Fix `app/signin/page.tsx`
**File:** `app/signin/page.tsx`
**depends-on:** none

Changes:
1. Main container: `p-8` → `p-4 sm:p-8`
2. Emoji heading: `text-5xl` → `text-4xl sm:text-5xl`

---

### Task 8 — Fix `app/todos/recurring/page.tsx`
**File:** `app/todos/recurring/page.tsx`
**depends-on:** Task 1

Changes:
1. Same nav fix as Task 1
2. Content wrapper: `p-8 pt-10 gap-6` → `p-4 sm:p-8 pt-6 sm:pt-10 gap-4 sm:gap-6`
3. Form controls row: `flex items-center gap-3` → `flex flex-wrap items-center gap-2 sm:gap-3`
4. Form container: `p-5` → `p-3 sm:p-5`

---

### Task 9 — Fix `components/TodoList.tsx`
**File:** `components/TodoList.tsx`
**depends-on:** none

Changes:
1. Input + button row: `flex gap-2` → `flex flex-col sm:flex-row gap-2`
2. Add button: add `w-full sm:w-auto` so it fills width when stacked
3. Recurring controls wrapper: `flex items-center gap-2 flex-1` → `flex flex-wrap items-center gap-2 flex-1`

---

### Task 10 — Fix `components/SignInForm.tsx`
**File:** `components/SignInForm.tsx`
**depends-on:** none

Changes:
1. Title: `text-2xl` → `text-xl sm:text-2xl`

---

### Task 11 — Build & Lint Validation
**depends-on:** Tasks 1–10

```bash
cd /home/claude/dev/lifelUp
npm run build
npm run lint
```

Both must pass with zero errors/warnings.

---

### Task 12 — Production Deploy
**depends-on:** Task 11

```bash
cd /var/www/lifelup && git pull origin main && npm ci --production=false && npm run build && pm2 restart lifelup
```

No Convex deploy needed — no schema or function changes.

---

## Validation Sequence

### 1. TypeScript & Lint
```bash
cd /home/claude/dev/lifelUp
npm run build   # Must exit 0
npm run lint    # Must exit 0
```

### 2. Manual Browser Check
Open `https://lifelup.aidigitalassistant.cloud` in Chrome DevTools → toggle device toolbar → iPhone SE (375×667).

Check each page:
- [ ] `/` — no horizontal scroll, nav fits, todo form usable
- [ ] `/family` — tabs scroll, labels truncate, cards readable
- [ ] `/coach` — message bubbles fit, input usable
- [ ] `/goals` — cards readable
- [ ] `/context` — modal fits screen, textarea usable
- [ ] `/quests` — quest cards readable
- [ ] `/todos/recurring` — form controls stack/wrap
- [ ] `/signin` — form centered, no overflow

### 3. Confirm No Regressions on Desktop
At 1280px width, check that all pages look the same as before (spacing should use the `sm:` values which match old fixed values).

---

## Known Risks

1. **Nav overflow on very small screens (< 320px):** The `overflow-x-auto` approach allows horizontal scroll within the nav — acceptable for MVP. If the family has very old/tiny phones, a hamburger menu would be needed (out of scope).

2. **`flex-col sm:flex-row` on TodoList may feel different:** The add button will be full-width on mobile. This is intentional and actually better UX. Verify it looks correct in the browser.

3. **Textarea `rows={3}` on desktop:** Reducing from `rows={5}` affects desktop too. If this looks too cramped, keep it at `rows={4}` as a compromise.

4. **No Convex deploy needed** — all changes are purely frontend Tailwind class edits. Only `pm2 restart lifelup` after deploying the Next.js build.

5. **Test dark mode too** — all pages support dark mode. Ensure responsive changes don't break dark mode styling (they shouldn't, since only spacing/layout classes are changed, not color classes).

---

## Confidence Score: 9/10

All changes are pure Tailwind class edits on existing files. No new components, no logic changes, no Convex changes. The nav pattern repeats identically across all pages — fix it once as a reference (Task 1) then replicate. The only uncertainty is whether `rows={3}` feels right on desktop for the textarea.

Ready to implement: `/execute-prp PRPs/responsive-design.md`

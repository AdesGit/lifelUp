# Feature Request: Gamification — Stars, Recurring Todos & Quests

---

## What (Goal)
Transform the todo system into a lightweight gamification layer: users earn stars (points) by completing tasks, recurring todos auto-reset daily/weekly, a background agent assigns star values to each task, and a weekly quest agent groups tasks into bonus-point challenges. The family page gains per-user tabs so clicking a user shows only their todos.

## Who Uses It
- [x] Single user (authenticated, per-user data) — stars, recurring todos
- [x] All family members (shared data, visible to everyone) — family tabs view
- [x] Background agent only (no user session, HTTP endpoints) — star evaluator, quest generator
- [x] Scheduled job (RemoteTrigger, runs daily/weekly automatically) — recurring reset, quest generation

## Success Criteria
- [ ] Family page shows one tab per user; clicking a tab shows only that user's todos
- [ ] Each todo has a star value (1–5) assigned by the evaluator agent
- [ ] Completing a todo adds its star value to the user's total star count
- [ ] A management screen at `/todos/recurring` lets users create/edit/delete recurring todos (daily or weekly)
- [ ] Recurring todos auto-respawn at the correct interval (daily agent resets completed daily todos; weekly agent resets weekly ones)
- [ ] A `/quests` page shows the current week's active quests with progress and bonus stars
- [ ] Completing all todos in a quest grants bonus stars automatically
- [ ] App builds without TypeScript errors (`npm run build`)
- [ ] Lint passes with zero warnings (`npm run lint`)
- [ ] Unauthenticated users are redirected to `/signin`
- [ ] All new agent endpoints return 401 for wrong Bearer token

## Layers Affected
- [x] Convex schema (new columns on todos, new tables: recurringTodos, quests, questTodos)
- [x] Convex functions (new queries and mutations for recurring, stars, quests)
- [x] HTTP agent endpoints (`convex/http.ts` — evaluator + quest generator + recurring reset)
- [x] Next.js page (family page tabs, new /todos/recurring page, new /quests page)
- [x] React component (UserTabs component, StarBadge component, QuestCard component)
- [x] Background agent script (star-evaluator.mjs — assigns point values to todos)
- [x] PM2 process (lifelup-star-evaluator in ecosystem.config.cjs)
- [x] RemoteTrigger (daily recurring reset + weekly quest generation)

## Convex Tables Needed

### Modify: `todos`
Add columns:
- `starValue: v.optional(v.number())` — 1–5, set by evaluator agent (null until evaluated)
- `recurrenceId: v.optional(v.id("recurringTodos"))` — links to recurring template if spawned from one

### New: `recurringTodos`
- `userId: v.id("users")`
- `text: v.string()`
- `frequency: v.union(v.literal("daily"), v.literal("weekly"))`
- `starValue: v.optional(v.number())` — assigned by evaluator
- `lastSpawnedAt: v.optional(v.number())` — timestamp of last todo creation
- Indexes: `by_user`, `by_frequency`

### Modify: `users`
Add column:
- `totalStars: v.optional(v.number())` — cumulative stars earned (default 0)

### New: `quests`
- `title: v.string()`
- `description: v.string()`
- `bonusStars: v.number()`
- `weekStart: v.number()` — Monday timestamp of the week this quest is for
- `status: v.union(v.literal("active"), v.literal("completed"), v.literal("expired"))`
- `fingerprint: v.string()` — "week-YYYY-WW:slug"
- Indexes: `by_status`, `by_fingerprint`

### New: `questTodos`
- `questId: v.id("quests")`
- `userId: v.id("users")`
- `todoText: v.string()` — description of the todo type to complete
- `completed: v.boolean()`
- `completedTodoId: v.optional(v.id("todos"))` — which actual todo completed it
- Indexes: `by_quest`, `by_user`

## UI Sketch

**Family page (modified):**
- Replace the flat list with horizontal tabs, one per user (show user email/name)
- Clicking a tab shows only that user's todos (same todo card style)
- Active tab: blue underline, inactive: gray

**Recurring todos page (`/todos/recurring`):**
- Header: "Recurring Tasks" with "+ New" button
- Simple list: task text | Daily/Weekly badge | star value | delete button
- "+ New" opens an inline form: text input + Daily/Weekly toggle + Save button
- No complex scheduling — just daily or weekly, that's it

**Quests page (`/quests`):**
- Header: "This week's quests" + total stars badge for the user
- Quest cards: title, description, progress bar (X/N tasks done), bonus stars badge
- Completed quests shown with green checkmark and "Bonus earned" label
- Each quest shows the list of required todo types

## Most Similar Existing Feature
- **Family tabs**: `app/family/page.tsx` (already shows all users' todos — just add tabs)
- **Recurring + stars schema**: `convex/todos.ts` + `convex/schema.ts` (modify existing)
- **Quests agent + page**: `convex/goals.ts` + `app/goals/page.tsx` (new table + scheduled agent + page)
- **Star evaluator agent**: `convex/context.ts` + `lifelup-agent/coach-poll.mjs` (polling agent pattern)

## Out of Scope
- No leaderboard between users (stars are personal, not competitive)
- No star redemption or rewards — just accumulation for now
- No custom quest creation by users — quests are AI-generated only
- No push notifications when quests complete
- No historical star tracking per day — just a running total
- No difficulty levels or categories on recurring todos

## Additional Context
- Star values: simple 1–5 scale. 1 = trivial (take a vitamin), 5 = hard (write a report)
- The evaluator agent should run on a short poll interval (e.g., every 5 minutes) to quickly assign star values to newly created todos
- Quest generation: weekly on Monday morning. Agent looks at recurring todos + recent one-off todos to propose 2–3 quests per user, each requiring 3–5 specific task completions
- Quest completion detection: when a todo is toggled complete, check if its text matches any open questTodo for that user — if so, mark questTodo complete and check if the whole quest is done
- Keep the star display simple: a ⭐ badge on the todo card showing the value, and a total ⭐ count in the nav header

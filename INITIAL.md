## What (Goal)
Build three new pages in LifeLup:
1. /calendar — day/week/month calendar views showing only Google Calendar events (todos with
   gcalEventId). Drag & drop to move events changes their dueAt in LifeLup and syncs to GCal.
   Add/edit/delete events via inline forms.
2. /todos-board — todos board showing ALL todos (with and without dueAt), per-user view and
   global family view. Family view allows completing another member's todo (syncs to GTasks).
3. /dashboard — single page combining a mini calendar widget + today's events + todo list.

## Who Uses It
- [x] All family members individually (per-user views)
- [x] All family members (global family view in todos-board)

## Success Criteria
- [ ] /calendar page has Day / Week / Month tab switcher
- [ ] Calendar events (todos with gcalEventId) render as colored blocks on their dueAt date
- [ ] Drag & drop an event to a new date → updates dueAt in LifeLup, triggers GCal sync
- [ ] Click an event → edit modal (change title, date) with save + delete buttons
- [ ] Click empty time slot → create new event modal → creates todo with dueAt + gcalEventId via sync
- [ ] /todos-board has "Mon compte" tab (current user's todos) and "Famille" tab (all members)
- [ ] Todos without dueAt shown in "Non planifié" column; todos with dueAt shown under their date
- [ ] Family tab: completing a todo calls the user's Google Tasks completion endpoint
- [ ] /dashboard shows: today's calendar events (mini) + current user's todos due today + family progress summary
- [ ] Nav updated: add Calendar, Todos Board, Dashboard links
- [ ] App builds without TypeScript errors

## Most Similar Existing Feature
- family/page.tsx — per-user tabs + family view pattern
- app/page.tsx — todo list pattern
- The gcal sync fields (gcalEventId, dueAt) are already on todos

## Layers Affected
- [ ] Convex functions — new queries: getTodosForCalendar (by dueAt range), getTodosByUser, getAllTodosAllUsers
- [ ] Next.js pages — new app/calendar/page.tsx, app/todos-board/page.tsx, app/dashboard/page.tsx
- [ ] Next.js API route — app/api/gcal/event-move/route.ts (called on drag & drop, updates dueAt + triggers GCal sync)
- [ ] Convex schema — no new tables; new index on todos: by_user_due already exists; add by_due_range if needed
- [ ] Nav — add Calendar, Todos Board, Dashboard to all page nav headers

## Additional Context

### /calendar page architecture

Three views: Day | Week | Month. Build custom with CSS grid (no external lib — keep bundle small).

**Month view:**
- 6-row grid × 7 columns
- Each cell shows the date + event chips (colored, truncated text)
- Click cell → switch to Day view for that date

**Week view:**
- 7 columns (Mon-Sun), rows = hours (00:00–23:00)
- Events positioned by dueAt hour (if dateTime) or top of day (if date-only/all-day)
- Drag event to different column = change date; drag to different row = change time

**Day view:**
- Single column, hour rows
- Same drag behavior

**Drag & drop:**
- Use HTML5 drag-and-drop API (no external lib)
- On drop: call POST /api/gcal/event-move { todoId, newDueAt }
- /api/gcal/event-move: updates todo dueAt in Convex (via gcal-todo-update endpoint) + triggers immediate GCal PATCH

**Event colors:**
- Each user gets a color (Christian=blue, Linda=pink, Kalea=purple, Keoni=green)
- GCal events: full color; LifeLup-native events with dueAt but no gcalEventId: lighter shade

**Create event modal (click empty slot):**
- Fields: titre, date + heure, utilisateur (current user only)
- Saves as todo with dueAt set; sync agent will push to GCal on next run (or call /api/gcal/sync inline)

**Edit/delete modal (click existing event):**
- Fields: titre, date + heure
- Delete = mark todo completed=true (sync agent removes from GCal) OR soft-delete via new mutation

### /todos-board page

Two tabs: "Mes todos" | "Famille"

**Mes todos:**
- Two sections:
  - "Non planifié" — todos without dueAt, sorted by creation date
  - "Planifié" — todos with dueAt, sorted by date ascending
- Each todo: text, category badge, star value, complete button, edit button

**Famille:**
- One column per family member (4 columns or scrollable tabs on mobile)
- Each column shows that member's todos (incomplete, sorted by dueAt then creation)
- Complete button on each todo calls Convex mutation + triggers GTasks completion for that user
- Read-only otherwise (can't edit other members' todos text)

### /dashboard page

Layout (vertical on mobile, 2-col on desktop):
- Left: mini month calendar widget (shows dots for days with events) + today's events list
- Right: "Mes todos aujourd'hui" (todos due today or overdue) + family progress bars (X/Y todos done today per member)

### /api/gcal/event-move route
POST { todoId, newDueAt }
1. Update todo dueAt in Convex via internal mutation
2. If todo has gcalEventId: PATCH GCal event immediately (don't wait for 15min agent)
3. Return { ok: true }

### New Convex queries needed
- internal.todos.getTodosInRange: userId + fromTs + toTs → todos with dueAt in range
- api.todos.listForBoard: userId → { planned: Todo[], unplanned: Todo[] }
- api.todos.listAllUsers: → { [userId]: Todo[] } (for family view)
- api.users.listAll: → User[] with email + totalStars

### Navigation
Add to nav in ALL pages: Calendar · Todos Board · Dashboard
(between existing Quests and Agents links)

### French UI throughout
All labels in French: Jour / Semaine / Mois, Non planifié / Planifié, Mes todos / Famille,
Aujourd'hui, Événements, etc.

### No external calendar library
Build with CSS grid + HTML5 drag-and-drop only.
Keep components under 300 lines — split into:
- components/calendar/MonthView.tsx
- components/calendar/WeekView.tsx
- components/calendar/DayView.tsx
- components/calendar/EventModal.tsx
- components/todos-board/TodoColumn.tsx

Initiated from second brain feature backlog on 2026-04-04.

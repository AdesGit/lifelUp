---
description: Create a comprehensive implementation plan for a LifeLup feature
argument-hint: <feature-name-or-description>
---

# Plan Feature: $ARGUMENTS

## Phase 1: Feature Understanding

1. **Problem** — What does this address?
2. **Success criteria** — What does "done" look like?
3. **Scope** — In vs. out of scope
4. **Impact** — Which layers? (convex functions / app pages / components / both)
5. **Auth required?** — Does this need authenticated user context?

## Phase 2: Codebase Research

Spawn subagents in parallel:

**Subagent A — Affected files:**
Read all relevant files in scope. Map current data flow.

**Subagent B — Schema + types:**
Read `convex/schema.ts` and `convex/_generated/dataModel.d.ts`. Identify tables and types needed.

**Subagent C — Existing patterns:**
Find similar features already implemented. Read 2-3 files for conventions.

## Phase 3: Plan Generation

Save to `.claude/plans/{kebab-case-name}.md`:

```markdown
# Plan: {Feature Name}

## Overview
{1-2 sentence summary}

## Success Criteria
- [ ] {criterion}
- [ ] App builds without errors
- [ ] Auth-protected routes redirect unauthenticated users

## Affected Files
- `convex/{file}.ts` — {what changes}
- `app/{route}/page.tsx` — {what changes}
- `components/{component}.tsx` — {what changes}

## Tasks

### Task 1: {name}
**File:** `{path}`
**Type:** Create | Modify
**Description:** {what and why}
**Depends on:** none

## Validation
1. `npm run build` — zero errors
2. `npm run lint` — zero warnings
3. Manual: {specific steps to test}
```

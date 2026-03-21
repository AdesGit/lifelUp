---
description: Execute a LifeLup implementation plan file
argument-hint: <path-to-plan.md>
---

# Execute Plan: $ARGUMENTS

## Step 1: Read the Full Plan
Read `$ARGUMENTS` before writing any code. Understand all tasks, dependencies, and validation steps.

## Step 2: Verify Clean State
!`git status`

Flag any unrelated uncommitted changes before proceeding.

## Step 3: Execute Tasks in Order

For each task:
1. **Read** the target file before modifying
2. **Implement** using Edit or Write tools
3. **Verify** TypeScript compiles: `npm run build 2>&1 | tail -20`

### Conventions to follow:
- All Convex functions need explicit argument validators (`v.string()`, etc.)
- Client components using auth: `"use client"` + `useConvexAuth()` or `useAuthActions()`
- Server components: never import `@convex-dev/auth/react`
- Tailwind for all styling — no inline styles
- No `any` types without justification

## Step 4: Validation
```bash
npm run build        # must pass
npm run lint         # must pass
```

## Step 5: Report
```
## Execution Report: {Plan Name}

### Tasks Completed
- [x] Task N: {description} — {files changed}

### Files Created/Modified
- `{path}` — {purpose}

### Validation
- build: PASS / FAIL
- lint: PASS / FAIL

### Manual Verification
{Steps taken to verify feature works}
```

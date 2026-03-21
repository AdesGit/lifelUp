---
description: Create an enriched conventional commit for current changes
---

# Commit Changes

## Process

### 1. Review Changes
!`git status`
!`git diff HEAD`
!`git diff --stat HEAD`
!`git ls-files --others --exclude-standard`

### 2. Stage Relevant Files
Add changed/new files related to current work.

**Never stage:** `.env*`, credential files, `node_modules/`

### 3. Commit Format

```
tag(scope): concise description of what changed

[Body: WHY this change was made — context not obvious from diff]

[If AI context files changed:]
Context:
- Updated .claude/rules/{file}.md — {why rule was added/changed}
- Added .claude/commands/{cmd}.md — {what it does}
```

**Tags:** `feat` | `fix` | `refactor` | `docs` | `test` | `chore` | `perf`

**Scopes for LifeLup:** `auth` | `convex` | `frontend` | `layout` | `ci` | `wisc`

**Examples:**
```
feat(auth): add password sign-in and sign-up with Convex Auth

Implements email/password authentication using @convex-dev/auth.
Chose Password provider over OAuth for simplicity as first auth method.

Context:
- Added .claude/rules/convex.md with auth pattern conventions
```

### 4. AI Context Changes
Include `Context:` section if any `.claude/` files were created or modified.

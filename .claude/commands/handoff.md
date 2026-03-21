---
description: Write a session handoff document to resume work later
---

# Handoff: Capture Session State

## Process

### 1. Gather State
!`git status`
!`git diff --stat HEAD`
!`git log --oneline -5`
!`git branch --show-current`

### 2. Write HANDOFF.md

Save to `HANDOFF.md` in repo root:

```markdown
# Handoff: [Brief Task Description]

**Date:** [today]
**Branch:** [branch]
**Last Commit:** [hash + message]

## Goal
[1-2 sentences: what we're trying to accomplish]

## Completed
- [x] [task done]

## Next Steps
- [ ] [specific next action with file paths]
- [ ] [blocked item + why]

## Key Decisions
- **[Decision]**: [what] — [why, alternatives rejected]

## Dead Ends
- [Approach tried] — [why it failed]

## Files Changed
- `path/to/file.ts` — [what changed]

## Current State
- **Build:** working / broken
- **Lint:** clean / N warnings
- **Manual verification:** [what was tested]

## Context for Next Session
[2-3 sentences: most important thing to know. What's the risk? What to do first?]

**Recommended first action:** [exact command or step]
```

### 3. After Writing
Confirm path written. Suggest: `Read HANDOFF.md and continue from where the previous session left off.`

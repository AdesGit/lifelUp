---
description: Prime agent with full LifeLup codebase understanding
---

# Prime: Load LifeLup Project Context

## Process

### 1. Read Core Documentation
Read `CLAUDE.md` — authoritative stack reference, file structure, and conventions.

### 2. Understand App Structure
!`ls app/ components/ convex/`

### 3. Read Key Files
- `app/layout.tsx` — root layout with provider setup
- `components/ConvexClientProvider.tsx` — Convex + Auth wiring
- `convex/schema.ts` — database schema
- `convex/auth.ts` — auth providers
- `convex/auth.config.ts` — auth domain config

### 4. Check Current State
!`git log --oneline -10`
!`git status`

## Output Report (under 200 words)

### Architecture
- Stack, provider setup, auth flow

### Current State
- Active branch, recent changes, any uncommitted work

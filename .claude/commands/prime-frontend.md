---
description: Prime agent with LifeLup frontend (Next.js + React) context
---

# Prime Frontend: Next.js and Components

## Process

### 1. Understand App Router Pages
!`find app -name "*.tsx" | sort`

Read:
- `app/layout.tsx` — root layout, font setup, provider wrapping
- `app/page.tsx` — protected home page
- `app/signin/page.tsx` — sign in / sign up page

### 2. Understand Components
!`ls components/`

Read all files in `components/` — focus on auth state usage patterns.

### 3. Check Tailwind Config
!`cat tailwind.config.ts 2>/dev/null || cat tailwind.config.js 2>/dev/null`

### 4. Recent Frontend Changes
!`git log --oneline -5 -- app/ components/`

## Output (under 150 words)
- Page structure and routing
- Auth state management pattern
- Component conventions used

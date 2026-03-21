---
description: Prime agent with LifeLup Convex backend context
---

# Prime Backend: Convex Functions

## Process

### 1. Understand Schema
Read `convex/schema.ts` — all tables, indexes, authTables setup.

### 2. Understand Auth Setup
Read `convex/auth.ts` — providers configured.
Read `convex/auth.config.ts` — domain and applicationID.
Read `convex/http.ts` — HTTP routes exposed.

### 3. List All Convex Functions
!`ls convex/`

Read any non-auth convex files (users.ts, todos.ts, etc.)

### 4. Check Generated Types
!`ls convex/_generated/ 2>/dev/null`

### 5. Recent Backend Changes
!`git log --oneline -5 -- convex/`

## Output (under 150 words)
- Schema tables and purpose
- Auth providers active
- Available queries/mutations
- Any open issues or TODOs

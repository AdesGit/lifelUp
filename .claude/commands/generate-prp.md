---
description: Generate a LifeLup PRP from a completed INITIAL.md
argument-hint: (reads INITIAL.md by default, or specify a path)
---

# Generate PRP from INITIAL.md

Read `INITIAL.md` (or `$ARGUMENTS` if provided). Generate a complete PRP saved to `PRPs/{kebab-case-feature-name}.md`.

## Step 1: Read and Parse INITIAL.md

Read the file. Extract:
- **Goal**: What this feature builds
- **Who Uses It**: single user / family / agent / scheduled
- **Layers Affected**: which checkboxes are checked
- **Most Similar Existing Feature**: what code to study
- **Success Criteria**: the user's stated criteria

If any section is blank or too vague to generate a concrete task list, note it in Step 5 instead of guessing.

## Step 2: Research the Codebase (launch 3 subagents in parallel)

**Subagent A — Schema and API surface:**
Read `convex/schema.ts` and `convex/_generated/api.d.ts`.
Report: all existing table names, their indexes, and the exact import + fullApi pattern needed for a new module.

**Subagent B — Most similar existing feature:**
Read the module named in INITIAL.md "Most Similar Existing Feature" — both the Convex module and its page.
For goals: read `convex/goals.ts` + `app/goals/page.tsx`
For context: read `convex/context.ts` + `app/context/page.tsx`
For todos/coach: read `convex/todos.ts` + `app/page.tsx`
Report: exact function signatures, table name, index names, HTTP endpoint paths used.

**Subagent C — Example files relevant to this feature:**
Based on the "Layers Affected" checkboxes, read the applicable files:
- Always: `examples/convex-mutation.ts`
- If HTTP endpoints: `examples/convex-http-agent.ts`
- If new page: `examples/app-page.tsx`
- If polling agent: `examples/agent-script.mjs`
Report: the exact patterns to copy for this feature.

## Step 3: Generate the PRP

Copy `PRPs/templates/prp_lifelup.md`. Fill in every section using the research:

**Overview**: 1-2 sentences from INITIAL.md goal.

**Success Criteria**:
- Copy user's criteria from INITIAL.md
- Add standard criteria: build, lint, auth redirect
- If HTTP endpoints: add Bearer token 401 check
- If agent-writable table: add fingerprint dedup check
- Add specific manual verification step (what URL, what action, what to observe)

**Context Files to Read**: list the specific files from Subagent B and C results.

**Affected Files table**: specific file paths. Use exact module name (not "newmodule" — use the real name).

**Tasks**: Fill each task with:
- Specific file path (not generic placeholder)
- Actual field names and types based on INITIAL.md
- Actual index names following the `by_{field}` convention
- Real function names that match the module name
- Real HTTP endpoint paths (e.g., `/agent/v1/achievements`, `/agent/v1/achievements-save`)
- `depends-on` filled in correctly

**Validation Sequence**: Real curl commands with the actual endpoint path. Real manual verification URL.

**Known Risks**: Specific risks for this feature. Always include api.d.ts and convex deploy reminders.

**Confidence Score**: Rate 1-10.
- 9-10: Pattern is identical to existing feature, all unknowns resolved
- 7-8: Minor uncertainty about one task; safe to execute
- 5-6: Ambiguity in INITIAL.md or novel pattern; clarify before executing
- < 5: Do not execute yet — ask user to fill in missing INITIAL.md sections

## Step 4: Save PRP

Save to `PRPs/{kebab-case-feature-name}.md`.
The kebab-case name should match the feature goal, e.g.:
- "Add achievements page" → `PRPs/achievements-page.md`
- "Weekly habit tracker" → `PRPs/habit-tracker.md`

## Step 5: Report to User

Output:
```
## PRP Generated: PRPs/{name}.md

Tasks: N
Complexity: simple / medium / complex
Confidence: X/10

[If confidence < 7]: Clarify before executing:
- [specific ambiguity 1]
- [specific ambiguity 2]

Ready to implement? Run: /execute-prp PRPs/{name}.md
```

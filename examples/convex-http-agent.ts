/**
 * PATTERN: Convex HTTP agent endpoints
 *
 * Extracted from convex/http.ts (context endpoints — simplest complete example).
 * Copy this structure for any new /agent/v1/* endpoint pair.
 *
 * Key rules:
 * - ALWAYS call verifyAgentSecret(req) as the FIRST line of every agent handler
 * - ALWAYS use internal.* — never api.* — inside httpAction handlers
 * - HTTP actions run on port 3211 (Convex HTTP actions engine)
 *   Nginx routes /agent/ → 3211 on convex.aidigitalassistant.cloud
 * - Add new routes to convex/http.ts, not a separate file (single router)
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);  // required — serves /.well-known/openid-configuration

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Verify Bearer token from Authorization header.
 * AGENT_SECRET is set via `npx convex env set AGENT_SECRET <value>`.
 * The same secret is hardcoded in coach-poll.mjs and RemoteTrigger agent prompts.
 *
 * Call this as the FIRST line of every agent endpoint handler.
 * Return 401 immediately if it returns false — do not touch the database.
 */
function verifyAgentSecret(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.AGENT_SECRET;
  return !!secret && authHeader === `Bearer ${secret}`;
}

// ─── GET endpoint — fetch data for agent to process ───────────────────────────

/**
 * Pattern: GET /agent/v1/[resource]
 * Returns JSON array that the agent (RemoteTrigger or polling script) reads.
 * Calls internalQuery — never a public query — to bypass auth.
 */
http.route({
  path: "/agent/v1/context",                           // replace with your resource name
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    // Step 1: Auth check — always first
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Step 2: Fetch data via internal query (no user auth context available here)
    // NEVER use api.context.getAllEntries — use internal.context.getAllEntries
    const entries = await ctx.runQuery(internal.context.getAllEntries);

    // Step 3: Return as JSON
    return Response.json(entries);
  }),
});

// ─── POST endpoint — save agent results ───────────────────────────────────────

/**
 * Pattern: POST /agent/v1/[resource]-save
 * Receives an array of items from the agent, upserts each via internalMutation.
 * Returns { ok: true, saved: N } so the agent can log how many were processed.
 */
http.route({
  path: "/agent/v1/context-save",                      // replace with your resource name
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Step 1: Auth check — always first
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Step 2: Parse request body
    // Expect: { entries: [...] } — validate shape in the internalMutation, not here
    const { entries } = await req.json();

    // Step 3: Upsert each item via internal mutation
    // Loop serially (not Promise.all) to avoid overwhelming the DB with concurrent writes
    for (const entry of entries) {
      await ctx.runMutation(internal.context.upsertEntry, entry);
    }

    // Step 4: Return success with count for agent logging
    return Response.json({ ok: true, saved: entries.length });
  }),
});

// ─── Fan-out GET endpoint — complex multi-query pattern ───────────────────────

/**
 * Pattern: GET with parallel sub-queries per user
 * Used when each user needs their own data fetched (goals-work pattern).
 * See convex/http.ts /agent/v1/goals-work for the full implementation.
 */
http.route({
  path: "/agent/v1/goals-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });

    // Get all users who have conversation history
    const users = await ctx.runQuery(internal.goals.getUsersWithHistory);

    // Fan out: fetch each user's messages and existing goals in parallel
    const work = await Promise.all(
      users.map(async (user) => {
        const [messages, existingGoals] = await Promise.all([
          ctx.runQuery(internal.goals.getAllMessagesForUser, { userId: user._id }),
          ctx.runQuery(internal.goals.getGoalsForUser, { userId: user._id }),
        ]);
        return {
          userId: user._id,
          userEmail: user.email ?? "unknown",
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          existingGoals,
        };
      })
    );

    return Response.json(work);
  }),
});

export default http;

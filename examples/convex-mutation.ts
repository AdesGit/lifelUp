/**
 * PATTERN: Convex CRUD module
 *
 * Extracted from convex/todos.ts (public CRUD) + convex/goals.ts (internal agent upsert).
 * Copy this structure for any new Convex module.
 *
 * Key rules:
 * - Public query/mutation = callable from frontend via api.module.fn
 * - internalQuery/internalMutation = callable only from other Convex functions via internal.module.fn
 * - Always validate every arg with `v` — no unvalidated inputs
 * - Always check auth in public functions before touching the database
 * - Ownership check: verify todo.userId === userId before mutating someone else's record
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Public API (web app) ─────────────────────────────────────────────────────

/**
 * List records for the currently authenticated user.
 * Returns [] instead of throwing if unauthenticated — safe for useQuery() in React.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("todos")                                   // replace "todos" with your table name
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Create a new record owned by the current user.
 * Throws if unauthenticated — mutations should always require auth.
 */
export const create = mutation({
  args: { text: v.string() },                          // validate every arg with v.*
  handler: async (ctx, { text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("todos", { userId, text, completed: false });
  },
});

/**
 * Update a record — verify ownership before mutating.
 * Pattern: get record, check userId matches, then patch.
 */
export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    // Ownership check — never allow users to modify each other's records
    if (!todo || todo.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, { completed: !todo.completed });
  },
});

/**
 * Delete a record — same ownership check pattern as toggle.
 */
export const remove = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// ─── Internal API (agent only — not callable from frontend) ───────────────────

/**
 * Read all records — no auth required.
 * Used by HTTP agent endpoints to fetch data for LLM processing.
 * Never expose this as a public query — it bypasses auth intentionally.
 */
export const getAllItems = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("todos").collect();
  },
});

/**
 * Read records for a specific user — for agent fan-out patterns.
 * See convex/goals.ts getAllMessagesForUser for a more complex version.
 */
export const getItemsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Upsert-by-fingerprint — the required pattern for ALL agent-writable tables.
 *
 * Why fingerprint?
 * Agents run on a schedule (daily/weekly). Without deduplication, each run
 * creates duplicate records. The fingerprint is a stable identifier for a
 * logical entity: "category:slug" for goals, "category:title-slug" for context.
 *
 * How it works:
 * 1. Look up existing record by (userId, fingerprint) using compound index
 * 2. If found: patch it (update in place)
 * 3. If not found: insert new record
 *
 * Schema requirement: table must have .index("by_user_fingerprint", ["userId", "fingerprint"])
 * For family-wide tables (no userId): use .index("by_fingerprint", ["fingerprint"]) instead.
 */
export const upsertItem = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    fingerprint: v.string(),   // stable identifier — never changes for the same logical record
    // add your other fields here
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("todos")
      .withIndex("by_user_fingerprint", (q) =>
        q.eq("userId", args.userId).eq("fingerprint", args.fingerprint)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("todos", { ...args, createdAt: now, updatedAt: now });
    }
  },
});

import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Called by agents after each poll cycle
export const logRun = internalMutation({
  args: {
    agentName: v.string(),
    durationMs: v.number(),
    itemsProcessed: v.number(),
    promptChars: v.number(),
    outputChars: v.number(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("idle")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentRuns", { ...args, runAt: Date.now() });
    // Keep only last 500 runs total to avoid unbounded growth
    const all = await ctx.db.query("agentRuns").order("asc").collect();
    if (all.length > 500) {
      await ctx.db.delete(all[0]._id);
    }
  },
});

// Returns last N runs per agent, plus summary stats
export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const runs = await ctx.db.query("agentRuns").withIndex("by_run_at").order("desc").take(200);
    return runs;
  },
});

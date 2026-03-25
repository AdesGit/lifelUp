import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

const categoryValidator = v.union(
  v.literal("health"),
  v.literal("career"),
  v.literal("learning"),
  v.literal("family"),
  v.literal("finance"),
  v.literal("personal"),
);

// ─── Public (web app) ────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// ─── Internal (goals agent) ───────────────────────────────────────────────

// All users who have at least one agentMessage
export const getUsersWithHistory = internalQuery({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("agentMessages").collect();
    const seenIds = new Set<string>();
    for (const m of messages) seenIds.add(m.userId);

    // Query users table and filter to those who have messages
    const allUsers = await ctx.db.query("users").collect();
    return allUsers.filter((u) => seenIds.has(u._id));
  },
});

// All messages for a user across all their sessions, in chronological order
export const getAllMessagesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db
      .query("agentSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const allMessages = [];
    for (const session of sessions) {
      const msgs = await ctx.db
        .query("agentMessages")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .order("asc")
        .collect();
      allMessages.push(...msgs);
    }
    return allMessages.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// Existing goals for a user (agent merges against these)
export const getGoalsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Upsert: patch if fingerprint exists for this user, insert if not
export const upsertGoal = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    category: categoryValidator,
    horizon: v.union(v.literal("medium"), v.literal("long")),
    progress: v.number(),
    evidence: v.array(v.string()),
    nextActions: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("achieved"), v.literal("dropped")),
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_user_fingerprint", (q) =>
        q.eq("userId", args.userId).eq("fingerprint", args.fingerprint)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, extractedAt: now });
    } else {
      await ctx.db.insert("goals", { ...args, extractedAt: now });
    }
  },
});

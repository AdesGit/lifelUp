import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Public queries (web app) ──────────────────────────────────────────────

export const getOrCreateSession = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("agentSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("agentSessions", {
      userId,
      type: "coach",
      createdAt: Date.now(),
    });
  },
});

export const listMessages = query({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return ctx.db
      .query("agentMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
  },
});

// User sends a message — stored immediately, Claude Code agent will reply async
export const sendMessage = mutation({
  args: {
    sessionId: v.id("agentSessions"),
    content: v.string(),
  },
  handler: async (ctx, { sessionId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.insert("agentMessages", {
      sessionId,
      userId,
      role: "user",
      content,
      createdAt: Date.now(),
    });
  },
});

// ─── Internal queries (Claude Code polling agent) ─────────────────────────

// Returns all sessions where the last message is from the user (needs a reply)
export const getPendingSessions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("agentSessions").collect();
    const pending = [];

    for (const session of sessions) {
      const lastMsg = await ctx.db
        .query("agentMessages")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .order("desc")
        .first();

      if (!lastMsg || lastMsg.role !== "user") continue;

      // Only pick up messages less than 10 minutes old
      const age = Date.now() - lastMsg.createdAt;
      if (age > 10 * 60 * 1000) continue;

      const user = await ctx.db.get(session.userId);
      const todos = await ctx.db
        .query("todos")
        .withIndex("by_user", (q) => q.eq("userId", session.userId))
        .collect();
      const history = await ctx.db
        .query("agentMessages")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .order("asc")
        .collect();

      pending.push({
        sessionId: session._id,
        userId: session.userId,
        userEmail: user?.email ?? "unknown",
        todos: todos.map((t) => ({ text: t.text, completed: t.completed })),
        history: history.map((m) => ({ role: m.role, content: m.content })),
      });
    }

    return pending;
  },
});

// Internal version for reading messages (no auth required — used by agent)
export const getMessages = internalQuery({
  args: { sessionId: v.id("agentSessions") },
  handler: async (ctx, { sessionId }) => {
    return ctx.db
      .query("agentMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
  },
});

// ─── Internal mutations (Claude Code polling agent) ───────────────────────

export const saveMessage = internalMutation({
  args: {
    sessionId: v.id("agentSessions"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, { sessionId, userId, role, content }) => {
    await ctx.db.insert("agentMessages", {
      sessionId,
      userId,
      role,
      content,
      createdAt: Date.now(),
    });
  },
});

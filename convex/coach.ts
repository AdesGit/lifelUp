import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

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

// Internal version used by actions to avoid circular type reference
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

export const sendMessage = action({
  args: {
    sessionId: v.id("agentSessions"),
    content: v.string(),
  },
  handler: async (ctx, { sessionId, content }): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const [user, todos, history] = await Promise.all([
      ctx.runQuery(api.users.getMe),
      ctx.runQuery(api.todos.list),
      ctx.runQuery(internal.coach.getMessages, { sessionId }),
    ]);

    // Save user message immediately so it appears in UI
    await ctx.runMutation(internal.coach.saveMessage, {
      sessionId,
      userId,
      role: "user",
      content,
    });

    const pending = todos.filter((t) => !t.completed);
    const completed = todos.filter((t) => t.completed);
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const systemPrompt = `You are a personal life coach inside LifeLup, a gamified life management app.
Your role: help users reflect, prioritize, and stay aligned with their goals.
Style: warm, direct, concise. Ask one follow-up question at a time. Keep replies under 150 words.

User: ${user?.email ?? "unknown"}
Date: ${today}

Their tasks right now:
Pending (${pending.length}): ${pending.length ? pending.map((t) => `"${t.text}"`).join(", ") : "none"}
Done today (${completed.length}): ${completed.length ? completed.map((t) => `"${t.text}"`).join(", ") : "none"}

Use this context naturally — don't list it back verbatim. Focus on what matters to them.`;

    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ];

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages,
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    await ctx.runMutation(internal.coach.saveMessage, {
      sessionId,
      userId,
      role: "assistant",
      content: reply,
    });

    return reply;
  },
});

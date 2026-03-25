import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("recurringTodos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    text: v.string(),
    frequency: v.union(v.literal("daily"), v.literal("weekly")),
  },
  handler: async (ctx, { text, frequency }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("recurringTodos", {
      userId,
      text,
      frequency,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recurringTodos") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const template = await ctx.db.get(id);
    if (!template || template.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

export const getTemplatesNeedingSpawn = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const DAY = 86_400_000;
    const WEEK = 7 * DAY;
    const all = await ctx.db.query("recurringTodos").collect();
    return all.filter((t) => {
      if (!t.lastSpawnedAt) return true;
      const elapsed = now - t.lastSpawnedAt;
      return t.frequency === "daily" ? elapsed >= DAY : elapsed >= WEEK;
    });
  },
});

export const spawnTodo = internalMutation({
  args: { templateId: v.id("recurringTodos") },
  handler: async (ctx, { templateId }) => {
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    await ctx.db.insert("todos", {
      userId: template.userId,
      text: template.text,
      completed: false,
      recurrenceId: templateId,
    });
    await ctx.db.patch(templateId, { lastSpawnedAt: Date.now() });
  },
});

export const getTemplatesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("recurringTodos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getUnevaluated = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("recurringTodos").collect();
    return all.filter((t) => t.starValue == null);
  },
});

export const setStarValue = internalMutation({
  args: { id: v.id("recurringTodos"), starValue: v.number() },
  handler: async (ctx, { id, starValue }) => ctx.db.patch(id, { starValue }),
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const todos = await ctx.db.query("todos").collect();
    const users = await ctx.db.query("users").collect();
    const userMap = Object.fromEntries(users.map((u) => [u._id, u]));
    return todos.map((todo) => ({
      ...todo,
      user: userMap[todo.userId] ?? null,
    }));
  },
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.insert("todos", { userId, text, completed: false });
  },
});

export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found");
    const nowCompleted = !todo.completed;
    await ctx.db.patch(id, { completed: nowCompleted });

    if (nowCompleted && todo.starValue) {
      const user = await ctx.db.get(userId);
      await ctx.db.patch(userId, { totalStars: (user?.totalStars ?? 0) + todo.starValue });
    }

    if (nowCompleted && todo.recurrenceId) {
      await ctx.runMutation(internal.quests.checkQuestCompletion, {
        recurringTodoId: todo.recurrenceId,
        userId,
      });
    }
  },
});

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

export const getUnevaluatedTodos = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("todos").collect();
    return all.filter((t) => t.starValue == null);
  },
});

export const setTodoStarValue = internalMutation({
  args: { id: v.id("todos"), starValue: v.number() },
  handler: async (ctx, { id, starValue }) => ctx.db.patch(id, { starValue }),
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Compute the next UTC timestamp for a scheduled time string ("HH:MM")
function computeNextDueAt(scheduledTime: string, frequency: "daily" | "weekly"): number {
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hours, minutes, 0, 0);
  // If that time has already passed today, advance by one period
  if (next.getTime() <= now.getTime()) {
    if (frequency === "daily") {
      next.setUTCDate(next.getUTCDate() + 1);
    } else {
      next.setUTCDate(next.getUTCDate() + 7);
    }
  }
  return next.getTime();
}

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
  args: {
    text: v.string(),
    isRecurring: v.optional(v.boolean()),
    frequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"))),
    scheduledTime: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("household"),
      v.literal("family_help"),
      v.literal("training"),
      v.literal("school_work"),
      v.literal("leisure"),
      v.literal("other"),
    )),
  },
  handler: async (ctx, { text, isRecurring, frequency, scheduledTime, category }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    let nextDueAt: number | undefined;
    if (isRecurring && frequency && scheduledTime) {
      nextDueAt = computeNextDueAt(scheduledTime, frequency);
    }

    await ctx.db.insert("todos", {
      userId,
      text,
      completed: false,
      isRecurring: isRecurring ?? undefined,
      frequency: frequency ?? undefined,
      scheduledTime: scheduledTime ?? undefined,
      nextDueAt,
      category: category ?? "other",
    });
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

    if (nowCompleted) {
      // Compute next due time for recurring todos when completing
      let nextDueAt: number | undefined;
      if (todo.isRecurring && todo.scheduledTime && todo.frequency) {
        nextDueAt = computeNextDueAt(todo.scheduledTime, todo.frequency);
      }
      await ctx.db.patch(id, { completed: true, nextDueAt });

      if (todo.starValue) {
        const user = await ctx.db.get(userId);
        await ctx.db.patch(userId, { totalStars: (user?.totalStars ?? 0) + todo.starValue });
      }

      if (todo.recurrenceId) {
        await ctx.runMutation(internal.quests.checkQuestCompletion, {
          recurringTodoId: todo.recurrenceId,
          userId,
        });
      }
    } else {
      // Uncompleting a recurring todo: clear nextDueAt (it's active again now)
      await ctx.db.patch(id, {
        completed: false,
        nextDueAt: todo.isRecurring && todo.scheduledTime && todo.frequency
          ? computeNextDueAt(todo.scheduledTime, todo.frequency)
          : undefined,
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

export const savePushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, { endpoint, p256dh, auth }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Upsert by endpoint — don't create duplicates
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { p256dh, auth });
    } else {
      await ctx.db.insert("pushSubscriptions", {
        userId,
        endpoint,
        p256dh,
        auth,
        createdAt: Date.now(),
      });
    }
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

// Returns recurring todos whose nextDueAt has passed — used by notification agent
export const getDueRecurringTodos = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dueTodos = await ctx.db.query("todos").collect();
    const due = dueTodos.filter(
      (t) => t.isRecurring && t.nextDueAt != null && t.nextDueAt <= now
    );

    const result = [];
    for (const todo of due) {
      const subs = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", todo.userId))
        .collect();
      result.push({ todo, subscriptions: subs });
    }
    return result;
  },
});

// Reset a due recurring todo — called by notification agent after sending push
export const resetRecurringTodo = internalMutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const todo = await ctx.db.get(id);
    if (!todo || !todo.isRecurring || !todo.scheduledTime || !todo.frequency) return;
    const nextDueAt = computeNextDueAt(todo.scheduledTime, todo.frequency);
    await ctx.db.patch(id, { completed: false, nextDueAt });
  },
});

// Returns all todos with dueAt set for a given user (for GCal push)
export const getTodosWithDueAt = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.query("todos")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).gt("dueAt", 0))
      .collect();
  },
});

// Set gcalEventId + gcalUpdatedAt after creating/updating a GCal event
export const patchGcalFields = internalMutation({
  args: {
    id: v.id("todos"),
    gcalEventId: v.optional(v.string()),
    gcalUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, gcalEventId, gcalUpdatedAt }) => {
    await ctx.db.patch(id, { gcalEventId, gcalUpdatedAt });
  },
});

// Create a todo from a GCal event (GCal → LifeLup direction)
export const createFromGcal = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    dueAt: v.number(),
    gcalEventId: v.string(),
    gcalUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("todos", {
      userId: args.userId,
      text: args.text,
      completed: false,
      dueAt: args.dueAt,
      gcalEventId: args.gcalEventId,
      gcalUpdatedAt: args.gcalUpdatedAt,
      category: "other",
    });
  },
});

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
      lifelupUpdatedAt: Date.now(),
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
      await ctx.db.patch(id, { completed: true, nextDueAt, lifelupUpdatedAt: Date.now() });

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
        lifelupUpdatedAt: Date.now(),
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

// Returns ALL todos for a user (for Tasks sync — not filtered by dueAt)
export const getAllTodosForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Patch gtask fields after syncing a todo to/from Google Tasks
export const patchGtaskFields = internalMutation({
  args: {
    id: v.id("todos"),
    gtaskId: v.optional(v.string()),
    gtaskListId: v.optional(v.string()),
    gtaskUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, gtaskId, gtaskListId, gtaskUpdatedAt }) => {
    await ctx.db.patch(id, { gtaskId, gtaskListId, gtaskUpdatedAt });
  },
});

// Create a todo from a Google Task (GTasks → LifeLup direction)
export const createFromGtask = internalMutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    dueAt: v.optional(v.number()),       // may be absent — Google Tasks due dates are optional
    gtaskId: v.string(),
    gtaskListId: v.string(),
    gtaskUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("todos", {
      userId: args.userId,
      text: args.text,
      completed: false,
      dueAt: args.dueAt,
      gtaskId: args.gtaskId,
      gtaskListId: args.gtaskListId,
      gtaskUpdatedAt: args.gtaskUpdatedAt,
      lifelupUpdatedAt: 0,  // 0 means "never edited in LifeLup" → agent won't re-push
      category: "other",
    });
  },
});

// Set completed flag (used by Tasks sync when a Google Task is marked done)
export const setCompleted = internalMutation({
  args: { id: v.id("todos"), completed: v.boolean() },
  handler: async (ctx, { id, completed }) => {
    await ctx.db.patch(id, { completed });
  },
});

// ─── New functions for Calendar, Todos Board, Dashboard ──────────────────────

// Public query: returns { planned, unplanned } for current user (for todos board)
export const listForBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { planned: [], unplanned: [] };
    const all = await ctx.db.query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("completed"), false))
      .collect();
    const planned = all
      .filter((t) => t.dueAt != null)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    const unplanned = all
      .filter((t) => t.dueAt == null)
      .sort((a, b) => a._creationTime - b._creationTime);
    return { planned, unplanned };
  },
});

// Public query: all users with their incomplete todos (for family board view)
export const listAllForFamily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const allUsers = await ctx.db.query("users").collect();
    const allTodos = await ctx.db.query("todos")
      .filter((q) => q.eq(q.field("completed"), false))
      .collect();
    return allUsers.map((u) => ({
      user: u,
      todos: allTodos
        .filter((t) => t.userId === u._id)
        .sort((a, b) => (a.dueAt ?? a._creationTime) - (b.dueAt ?? b._creationTime)),
    }));
  },
});

// Public query: todos with dueAt in a time range (for calendar views)
export const getTodosInRange = query({
  args: { fromTs: v.number(), toTs: v.number() },
  handler: async (ctx, { fromTs, toTs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const allUsers = await ctx.db.query("users").collect();
    const allTodos = await ctx.db.query("todos").collect();
    const userMap = Object.fromEntries(allUsers.map((u) => [u._id, u]));
    return allTodos
      .filter((t) => t.dueAt != null && t.dueAt >= fromTs && t.dueAt <= toTs)
      .map((t) => ({ ...t, user: userMap[t.userId] ?? null }));
  },
});

// Mutation: update dueAt on a todo (for calendar drag & drop by owner)
export const updateDueAt = mutation({
  args: { id: v.id("todos"), dueAt: v.number() },
  handler: async (ctx, { id, dueAt }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found or not authorized");
    await ctx.db.patch(id, { dueAt, lifelupUpdatedAt: Date.now() });
  },
});

// Internal mutation: set dueAt on any todo (used by event-move API route)
export const patchDueAt = internalMutation({
  args: { id: v.id("todos"), dueAt: v.number() },
  handler: async (ctx, { id, dueAt }) => {
    await ctx.db.patch(id, { dueAt, lifelupUpdatedAt: Date.now() });
  },
});

// Mutation: patch todo title (for calendar edit modal)
export const patchTitle = mutation({
  args: { id: v.id("todos"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo || todo.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(id, { text, lifelupUpdatedAt: Date.now() });
  },
});

// Mutation: create a todo with a dueAt (for calendar create modal)
export const createWithDueAt = mutation({
  args: {
    text: v.string(),
    dueAt: v.number(),
    category: v.optional(v.union(
      v.literal("household"),
      v.literal("family_help"),
      v.literal("training"),
      v.literal("school_work"),
      v.literal("leisure"),
      v.literal("other"),
    )),
  },
  handler: async (ctx, { text, dueAt, category }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return ctx.db.insert("todos", {
      userId,
      text,
      completed: false,
      dueAt,
      category: category ?? "other",
      lifelupUpdatedAt: Date.now(),
    });
  },
});

// Mutation: complete a todo owned by any family member (family board view)
export const toggleForUser = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Not authenticated");
    const todo = await ctx.db.get(id);
    if (!todo) throw new Error("Not found");
    const nowCompleted = !todo.completed;
    await ctx.db.patch(id, { completed: nowCompleted, lifelupUpdatedAt: Date.now() });
    if (nowCompleted && todo.starValue) {
      const owner = await ctx.db.get(todo.userId);
      if (owner) {
        await ctx.db.patch(todo.userId, { totalStars: (owner.totalStars ?? 0) + todo.starValue });
      }
    }
  },
});

// Internal mutation: hard-delete a todo by id (used by dedupe endpoint)
export const deleteTodo = internalMutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const activeQuests = await ctx.db
      .query("quests")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const completedQuests = await ctx.db
      .query("quests")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const allQuests = [...activeQuests, ...completedQuests];

    const result = await Promise.all(
      allQuests.map(async (quest) => {
        const tasks = await ctx.db
          .query("questTodos")
          .withIndex("by_quest", (q) => q.eq("questId", quest._id))
          .filter((q) => q.eq(q.field("userId"), userId))
          .collect();
        return { ...quest, tasks };
      })
    );

    return result.filter((q) => q.tasks.length > 0);
  },
});

export const getUsersWithRecurring = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const result = [];

    for (const user of allUsers) {
      const recurring = await ctx.db
        .query("recurringTodos")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      if (recurring.length > 0) {
        result.push({ userId: user._id, userEmail: user.email, recurringTodos: recurring });
      }
    }

    return result;
  },
});

export const upsertQuest = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    bonusStars: v.number(),
    weekStart: v.number(),
    fingerprint: v.string(),
    todoAssignments: v.array(
      v.object({
        userId: v.id("users"),
        recurringTodoId: v.id("recurringTodos"),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .first();

    let questId;
    if (existing) {
      questId = existing._id;
      await ctx.db.patch(questId, {
        title: args.title,
        description: args.description,
        bonusStars: args.bonusStars,
      });
    } else {
      questId = await ctx.db.insert("quests", {
        title: args.title,
        description: args.description,
        bonusStars: args.bonusStars,
        weekStart: args.weekStart,
        status: "active",
        fingerprint: args.fingerprint,
      });
    }

    for (const assignment of args.todoAssignments) {
      const existingTask = await ctx.db
        .query("questTodos")
        .withIndex("by_quest", (q) => q.eq("questId", questId))
        .filter((q) =>
          q.and(
            q.eq(q.field("userId"), assignment.userId),
            q.eq(q.field("recurringTodoId"), assignment.recurringTodoId)
          )
        )
        .first();
      if (!existingTask) {
        await ctx.db.insert("questTodos", {
          questId,
          userId: assignment.userId,
          recurringTodoId: assignment.recurringTodoId,
          completed: false,
        });
      }
    }
  },
});

export const checkQuestCompletion = internalMutation({
  args: {
    recurringTodoId: v.id("recurringTodos"),
    userId: v.id("users"),
  },
  handler: async (ctx, { recurringTodoId, userId }) => {
    const openItems = await ctx.db
      .query("questTodos")
      .withIndex("by_recurring_todo", (q) => q.eq("recurringTodoId", recurringTodoId))
      .filter((q) =>
        q.and(q.eq(q.field("userId"), userId), q.eq(q.field("completed"), false))
      )
      .collect();

    for (const item of openItems) {
      await ctx.db.patch(item._id, { completed: true, completedAt: Date.now() });

      const allItems = await ctx.db
        .query("questTodos")
        .withIndex("by_quest", (q) => q.eq("questId", item.questId))
        .collect();
      const userItems = allItems.filter((i) => i.userId === userId);

      if (userItems.length > 0 && userItems.every((i) => i.completed)) {
        const quest = await ctx.db.get(item.questId);
        if (quest?.status === "active") {
          await ctx.db.patch(item.questId, { status: "completed" });
          const user = await ctx.db.get(userId);
          await ctx.db.patch(userId, {
            totalStars: (user?.totalStars ?? 0) + quest.bonusStars,
          });
        }
      }
    }
  },
});

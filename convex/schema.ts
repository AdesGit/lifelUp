import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    totalStars: v.optional(v.number()),
  }).index("email", ["email"]),
  todos: defineTable({
    userId: v.id("users"),
    text: v.string(),
    completed: v.boolean(),
    starValue: v.optional(v.number()),
    recurrenceId: v.optional(v.id("recurringTodos")),
  }).index("by_user", ["userId"]),
  recurringTodos: defineTable({
    userId: v.id("users"),
    text: v.string(),
    frequency: v.union(v.literal("daily"), v.literal("weekly")),
    starValue: v.optional(v.number()),
    lastSpawnedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_frequency", ["frequency"]),
  quests: defineTable({
    title: v.string(),
    description: v.string(),
    bonusStars: v.number(),
    weekStart: v.number(),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("expired")),
    fingerprint: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_fingerprint", ["fingerprint"]),
  questTodos: defineTable({
    questId: v.id("quests"),
    userId: v.id("users"),
    recurringTodoId: v.id("recurringTodos"),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  })
    .index("by_quest", ["questId"])
    .index("by_user", ["userId"])
    .index("by_recurring_todo", ["recurringTodoId"]),
  agentSessions: defineTable({
    userId: v.id("users"),
    type: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
  agentMessages: defineTable({
    sessionId: v.id("agentSessions"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
  contextEntries: defineTable({
    title: v.string(),
    category: v.union(
      v.literal("business"),
      v.literal("people"),
      v.literal("network"),
      v.literal("tools"),
      v.literal("home"),
      v.literal("other"),
    ),
    content: v.string(),
    tags: v.array(v.string()),
    source: v.union(v.literal("manual"), v.literal("ai")),
    fingerprint: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_fingerprint", ["fingerprint"]),
  goals: defineTable({
    userId: v.id("users"),
    title: v.string(),
    category: v.union(
      v.literal("health"),
      v.literal("career"),
      v.literal("learning"),
      v.literal("family"),
      v.literal("finance"),
      v.literal("personal"),
    ),
    horizon: v.union(v.literal("medium"), v.literal("long")),
    progress: v.number(),
    evidence: v.array(v.string()),
    nextActions: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("achieved"), v.literal("dropped")),
    fingerprint: v.string(),
    extractedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_fingerprint", ["userId", "fingerprint"]),
});

export default schema;

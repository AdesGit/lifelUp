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
  }).index("email", ["email"]),
  todos: defineTable({
    userId: v.id("users"),
    text: v.string(),
    completed: v.boolean(),
  }).index("by_user", ["userId"]),
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

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Returns the current user's GCal token doc (or null if not connected)
export const getMyToken = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// Called from the integrations page to disconnect Google Calendar
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.delete(token._id);
    // Remove GCal-sourced todos for this user
    const gcalTodos = await ctx.db.query("todos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.neq(q.field("gcalEventId"), undefined))
      .collect();
    for (const todo of gcalTodos) {
      await ctx.db.delete(todo._id);
    }
  },
});

// Called by the OAuth callback API route to persist the token
export const saveToken = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    googleEmail: v.string(),
    calendarId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
    } else {
      await ctx.db.insert("googleCalendarTokens", { ...args, connectedAt: now });
    }
  },
});

// Called by the sync agent after each successful sync run
export const updateLastSync = internalMutation({
  args: { userId: v.id("users"), lastSyncAt: v.number() },
  handler: async (ctx, { userId, lastSyncAt }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.patch(token._id, { lastSyncAt });
  },
});

// Called by the sync agent after token refresh
export const updateAccessToken = internalMutation({
  args: { userId: v.id("users"), accessToken: v.string(), expiresAt: v.number() },
  handler: async (ctx, { userId, accessToken, expiresAt }) => {
    const token = await ctx.db.query("googleCalendarTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (token) await ctx.db.patch(token._id, { accessToken, expiresAt });
  },
});

// Returns all users with an active GCal token (for the sync agent)
export const getAllTokens = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("googleCalendarTokens").collect(),
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const categoryValidator = v.union(
  v.literal("business"),
  v.literal("people"),
  v.literal("network"),
  v.literal("tools"),
  v.literal("home"),
  v.literal("other"),
);

function makeFingerprint(category: string, title: string): string {
  return `${category}:${title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60)}`;
}

// ─── Public (web app) ─────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db.query("contextEntries").order("desc").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    category: categoryValidator,
    content: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    return ctx.db.insert("contextEntries", {
      ...args,
      source: "manual",
      fingerprint: makeFingerprint(args.category, args.title),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("contextEntries"),
    title: v.string(),
    category: categoryValidator,
    content: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.patch(id, {
      ...fields,
      fingerprint: makeFingerprint(fields.category, fields.title),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("contextEntries") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.delete(id);
  },
});

// ─── Internal (AI agent) ──────────────────────────────────────────────────────

export const getAllEntries = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("contextEntries").collect(),
});

export const upsertEntry = internalMutation({
  args: {
    title: v.string(),
    category: categoryValidator,
    content: v.string(),
    tags: v.array(v.string()),
    fingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contextEntries")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, source: "ai", updatedAt: now });
    } else {
      await ctx.db.insert("contextEntries", {
        ...args,
        source: "ai",
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

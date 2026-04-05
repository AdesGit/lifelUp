import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

const appSchema = v.object({
  name:           v.string(),
  pkg:            v.string(),
  time_formatted: v.string(),
  minutes:        v.number(),
});

// ── Upsert: insert if new, replace if re-extracted for same child+date ─────────
export const upsertDailyActivity = internalMutation({
  args: {
    child_id:           v.number(),
    child_name:         v.string(),
    activity_date:      v.string(),
    extraction_date:    v.string(),
    total_time_minutes: v.number(),
    apps:               v.array(appSchema),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("daily_activity")
      .withIndex("by_child_date", (q) =>
        q.eq("child_id", args.child_id).eq("activity_date", args.activity_date)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        extraction_date:    args.extraction_date,
        total_time_minutes: args.total_time_minutes,
        apps:               args.apps,
      });
      return { id: existing._id, action: "updated" as const };
    } else {
      const id = await ctx.db.insert("daily_activity", args);
      return { id, action: "created" as const };
    }
  },
});

// ── Last N days for a child (default 7) ───────────────────────────────────────
export const getRecentActivity = query({
  args: {
    child_id: v.number(),
    days:     v.optional(v.number()),
  },
  handler: async (ctx, { child_id, days = 7 }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    return await ctx.db
      .query("daily_activity")
      .withIndex("by_child_date", (q) => q.eq("child_id", child_id))
      .filter((q) => q.gte(q.field("activity_date"), cutoffStr))
      .order("desc")
      .collect();
  },
});

// ── Both kids for a specific date ─────────────────────────────────────────────
export const getActivityByDate = query({
  args: { activity_date: v.string() },
  handler: async (ctx, { activity_date }) => {
    return await ctx.db
      .query("daily_activity")
      .withIndex("by_date", (q) => q.eq("activity_date", activity_date))
      .collect();
  },
});

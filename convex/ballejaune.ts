import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const sessionSchema = v.object({
  booking_id:       v.string(),
  date:             v.string(),
  time_start:       v.string(),
  duration_minutes: v.number(),
  court:            v.string(),
  status:           v.union(
    v.literal("played"),
    v.literal("cancelled"),
    v.literal("confirmed"),
    v.literal("upcoming"),
    v.literal("unknown"),
  ),
  partners: v.array(v.string()),
});

// ── Look up user by ballejauneLogin (case-insensitive) ────────────────────────
export const getUserByLogin = internalQuery({
  args: { memberLogin: v.string() },
  handler: async (ctx, { memberLogin }) => {
    // Try exact match first via index
    const exact = await ctx.db
      .query("users")
      .withIndex("by_ballejaune_login", (q) => q.eq("ballejauneLogin", memberLogin))
      .first();
    if (exact) return exact;
    // Fallback: case-insensitive scan (covers mismatches like "Gall Linda" vs "GALL Linda")
    const all = await ctx.db.query("users").collect();
    return all.find(
      (u) => u.ballejauneLogin?.toLowerCase() === memberLogin.toLowerCase()
    ) ?? null;
  },
});

// ── Main upsert: insert or replace for same (memberLogin, club, activityDate) ─
export const upsertBalleJauneActivity = internalMutation({
  args: {
    memberLogin:    v.string(),
    club:           v.string(),
    activityDate:   v.string(),
    extractionDate: v.string(),
    totalSessions:  v.number(),
    totalMinutes:   v.number(),
    sessions:       v.array(sessionSchema),
  },
  handler: async (ctx, args) => {
    // Look up linked user
    const user = await ctx.db
      .query("users")
      .withIndex("by_ballejaune_login", (q) => q.eq("ballejauneLogin", args.memberLogin))
      .first()
      ?? (await (async () => {
        const all = await ctx.db.query("users").collect();
        return all.find(
          (u) => u.ballejauneLogin?.toLowerCase() === args.memberLogin.toLowerCase()
        ) ?? null;
      })());

    const memberId = user?._id ?? undefined;

    // Upsert activity record
    const existing = await ctx.db
      .query("ballejaune_activity")
      .withIndex("by_member_club_date", (q) =>
        q.eq("memberLogin", args.memberLogin)
         .eq("club", args.club)
         .eq("activityDate", args.activityDate)
      )
      .unique();

    let id: Id<"ballejaune_activity">;
    let action: "created" | "updated";

    if (existing) {
      await ctx.db.patch(existing._id, {
        extractionDate: args.extractionDate,
        totalSessions:  args.totalSessions,
        totalMinutes:   args.totalMinutes,
        sessions:       args.sessions,
        memberId,
      });
      id = existing._id;
      action = "updated";
    } else {
      id = await ctx.db.insert("ballejaune_activity", { ...args, memberId });
      action = "created";
    }

    // Sync non-cancelled sessions as todos for linked user
    if (memberId) {
      for (const session of args.sessions) {
        if (session.status === "cancelled") continue;
        const existingTodo = await ctx.db
          .query("todos")
          .withIndex("by_booking_id", (q) => q.eq("ballejauneBookingId", session.booking_id))
          .first();

        const completed = session.status === "played";
        const dueAt = new Date(`${session.date}T${session.time_start}:00`).getTime();
        const clubLabel = args.club === "excelsior" ? "Excelsior"
          : args.club === "padelasdragon" ? "Padel as Dragon" : args.club;
        const text = `🎾 Padel ${session.date} ${session.time_start} — ${session.court} (${clubLabel})`;

        if (existingTodo) {
          await ctx.db.patch(existingTodo._id, { completed, dueAt });
        } else {
          await ctx.db.insert("todos", {
            userId: memberId,
            text,
            completed,
            dueAt,
            ballejauneBookingId: session.booking_id,
            category: "training",
          });
        }
      }
    }

    return { id, action };
  },
});

// ── Queries ────────────────────────────────────────────────────────────────────

// All activity for a linked user (last N records, default 30)
export const getActivityForUser = query({
  args: {
    userId: v.id("users"),
    limit:  v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit = 30 }) => {
    return await ctx.db
      .query("ballejaune_activity")
      .withIndex("by_member_id", (q) => q.eq("memberId", userId))
      .order("desc")
      .take(limit);
  },
});

// Activity by memberLogin for the last N days (no userId required — works before linking)
export const getRecentActivity = query({
  args: {
    memberLogin: v.string(),
    days:        v.optional(v.number()),
  },
  handler: async (ctx, { memberLogin, days = 14 }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    return await ctx.db
      .query("ballejaune_activity")
      .filter((q) => q.and(
        q.eq(q.field("memberLogin"), memberLogin),
        q.gte(q.field("activityDate"), cutoffStr),
      ))
      .order("desc")
      .collect();
  },
});

// Activity in a date range for a user
export const getActivityForDateRange = query({
  args: {
    userId:   v.id("users"),
    fromDate: v.string(),
    toDate:   v.string(),
  },
  handler: async (ctx, { userId, fromDate, toDate }) => {
    return await ctx.db
      .query("ballejaune_activity")
      .withIndex("by_member_id", (q) => q.eq("memberId", userId))
      .filter((q) => q.and(
        q.gte(q.field("activityDate"), fromDate),
        q.lte(q.field("activityDate"), toDate),
      ))
      .order("desc")
      .collect();
  },
});

// Latest record per club for a user
export const getLatestActivity = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const records = await ctx.db
      .query("ballejaune_activity")
      .withIndex("by_member_id", (q) => q.eq("memberId", userId))
      .order("desc")
      .collect();

    return {
      excelsior:     records.find((r) => r.club === "excelsior")     ?? null,
      padelasdragon: records.find((r) => r.club === "padelasdragon") ?? null,
    };
  },
});

// All distinct member logins (for the page to list available members)
export const getMembers = query({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("ballejaune_activity").collect();
    const seen = new Set<string>();
    const members: { memberLogin: string; memberId: Id<"users"> | undefined }[] = [];
    for (const r of records) {
      if (!seen.has(r.memberLogin)) {
        seen.add(r.memberLogin);
        members.push({ memberLogin: r.memberLogin, memberId: r.memberId });
      }
    }
    return members;
  },
});

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
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    ballejauneLogin: v.optional(v.string()),  // e.g. "GALL Christian"
  }).index("email", ["email"])
    .index("by_ballejaune_login", ["ballejauneLogin"]),
  todos: defineTable({
    userId: v.id("users"),
    text: v.string(),
    completed: v.boolean(),
    starValue: v.optional(v.number()),
    recurrenceId: v.optional(v.id("recurringTodos")),
    // Native recurring fields (new model — no separate table needed)
    isRecurring: v.optional(v.boolean()),
    frequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"))),
    scheduledTime: v.optional(v.string()), // "HH:MM" UTC 24h
    nextDueAt: v.optional(v.number()),     // timestamp of next reset/notification
    category: v.optional(v.union(
      v.literal("household"),
      v.literal("family_help"),
      v.literal("training"),
      v.literal("school_work"),
      v.literal("leisure"),
      v.literal("other"),
    )),
    dueAt: v.optional(v.number()),         // unix ms — user-set due date, drives calendar sync
    gcalEventId: v.optional(v.string()),   // GCal event ID (set after sync push)
    gcalUpdatedAt: v.optional(v.number()), // GCal event's last modification time (unix ms)
    gtaskId: v.optional(v.string()),          // Google Task ID
    gtaskListId: v.optional(v.string()),      // which Google Task list it belongs to
    gtaskUpdatedAt: v.optional(v.number()),   // last known GTask modification time (unix ms)
    lifelupUpdatedAt: v.optional(v.number()), // last time this todo was edited in LifeLup (unix ms)
    ballejauneBookingId: v.optional(v.string()), // booking_id from BalleJaune (set on auto-created todos)
  })
    .index("by_user", ["userId"])
    .index("by_next_due", ["nextDueAt"])
    .index("by_user_due", ["userId", "dueAt"])
    .index("by_booking_id", ["ballejauneBookingId"])
    .index("by_gcal_event_id", ["gcalEventId"])
    .index("by_gtask_id", ["gtaskId"]),
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),
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
  uploads: defineTable({
    userId: v.id("users"),
    uploadedAt: v.number(),
    todoId: v.optional(v.id("todos")),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),                        // bytes
    storageId: v.id("_storage"),
    description: v.optional(v.string()),     // filled by image agent
    summary: v.optional(v.string()),         // filled by image agent
    links: v.optional(v.array(v.string())),  // filled by image agent
    imageProcessed: v.optional(v.boolean()), // true after agent compressed + described
  })
    .index("by_user", ["userId"])
    .index("by_todo", ["todoId"])
    .index("by_user_uploaded", ["userId", "uploadedAt"]),
  agentRuns: defineTable({
    agentName: v.string(),
    runAt: v.number(),
    durationMs: v.number(),
    itemsProcessed: v.number(),
    promptChars: v.number(),     // prompt character count (tokens ≈ chars/4)
    outputChars: v.number(),     // output character count
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("idle")),
    errorMessage: v.optional(v.string()),
  })
    .index("by_agent", ["agentName"])
    .index("by_run_at", ["runAt"]),
  ballejaune_activity: defineTable({
    memberId:       v.optional(v.id("users")),  // null if member not yet linked
    memberLogin:    v.string(),                 // "GALL Linda"
    club:           v.string(),                 // "excelsior" | "padelasdragon"
    activityDate:   v.string(),                 // "YYYY-MM-DD"
    extractionDate: v.string(),                 // ISO 8601
    totalSessions:  v.number(),
    totalMinutes:   v.number(),
    sessions: v.array(v.object({
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
      partners:         v.array(v.string()),
    })),
  })
    .index("by_member_club_date", ["memberLogin", "club", "activityDate"])
    .index("by_member_id",        ["memberId"])
    .index("by_date",             ["activityDate"]),
  daily_activity: defineTable({
    child_id:           v.number(),   // 3 (Keoni) | 4 (Kalea)
    child_name:         v.string(),   // "Keoni" | "Kalea"
    activity_date:      v.string(),   // "YYYY-MM-DD" — the day being reported
    extraction_date:    v.string(),   // ISO 8601 — when the extractor ran
    total_time_minutes: v.number(),
    apps: v.array(v.object({
      name:           v.string(),     // "Crunchyroll: Anime Streaming"
      pkg:            v.string(),     // "com.crunchyroll.crunchyroid"
      time_formatted: v.string(),     // "6h 35m"
      minutes:        v.number(),     // 395
    })),
  })
    .index("by_child_date", ["child_id", "activity_date"])
    .index("by_date",       ["activity_date"]),
  googleCalendarTokens: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),          // unix ms
    googleEmail: v.string(),        // displayed in UI
    calendarId: v.string(),         // "primary"
    connectedAt: v.number(),        // unix ms
    lastSyncAt: v.optional(v.number()), // unix ms, updated after each sync run
    tasksScope: v.optional(v.boolean()),          // true after user re-authorized with Tasks scope
    defaultTaskListId: v.optional(v.string()),    // cached ID of user's "My Tasks" list
    lastTasksSyncAt: v.optional(v.number()),      // unix ms, updated after each Tasks sync run
  })
    .index("by_user", ["userId"]),
});

export default schema;

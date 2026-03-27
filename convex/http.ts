import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// ─── Claude Code agent endpoints ─────────────────────────────────────────

function verifyAgentSecret(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.AGENT_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

// GET /agent/v1/pending — returns sessions needing a reply
http.route({
  path: "/agent/v1/pending",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const pending = await ctx.runQuery(internal.coach.getPendingSessions);
    return Response.json(pending);
  }),
});

// POST /agent/v1/reply — save Claude Code's response
http.route({
  path: "/agent/v1/reply",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { sessionId, userId, content } = await req.json();
    await ctx.runMutation(internal.coach.saveMessage, {
      sessionId,
      userId,
      role: "assistant",
      content,
    });
    return Response.json({ ok: true });
  }),
});

// GET /agent/v1/goals-work — returns all users + their history + existing goals
http.route({
  path: "/agent/v1/goals-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const users = await ctx.runQuery(internal.goals.getUsersWithHistory);
    const work = await Promise.all(
      users.map(async (user) => {
        const [messages, existingGoals] = await Promise.all([
          ctx.runQuery(internal.goals.getAllMessagesForUser, { userId: user._id }),
          ctx.runQuery(internal.goals.getGoalsForUser, { userId: user._id }),
        ]);
        return {
          userId: user._id,
          userEmail: user.email ?? "unknown",
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          existingGoals,
        };
      })
    );
    return Response.json(work);
  }),
});

// POST /agent/v1/goals-save — upsert extracted goals for one user
http.route({
  path: "/agent/v1/goals-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { userId, goals } = await req.json();
    for (const goal of goals) {
      await ctx.runMutation(internal.goals.upsertGoal, { userId, ...goal });
    }
    return Response.json({ ok: true, saved: goals.length });
  }),
});

// GET /agent/v1/context — returns all context entries
http.route({
  path: "/agent/v1/context",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const entries = await ctx.runQuery(internal.context.getAllEntries);
    return Response.json(entries);
  }),
});

// POST /agent/v1/context-save — upsert AI-extracted context entries
http.route({
  path: "/agent/v1/context-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { entries } = await req.json();
    for (const entry of entries) {
      await ctx.runMutation(internal.context.upsertEntry, entry);
    }
    return Response.json({ ok: true, saved: entries.length });
  }),
});

// GET /agent/v1/recurring-work — returns templates needing a new spawn
http.route({
  path: "/agent/v1/recurring-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const templates = await ctx.runQuery(internal.recurringTodos.getTemplatesNeedingSpawn);
    return Response.json(templates);
  }),
});

// POST /agent/v1/recurring-spawn — spawn a todo from a recurring template
http.route({
  path: "/agent/v1/recurring-spawn",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { templateId } = await req.json();
    await ctx.runMutation(internal.recurringTodos.spawnTodo, { templateId });
    return Response.json({ ok: true });
  }),
});

// GET /agent/v1/todos-unevaluated — returns todos + recurring templates without starValue
http.route({
  path: "/agent/v1/todos-unevaluated",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const [todos, recurring] = await Promise.all([
      ctx.runQuery(internal.todos.getUnevaluatedTodos),
      ctx.runQuery(internal.recurringTodos.getUnevaluated),
    ]);
    const result = [
      ...todos.map((t) => ({ type: "todo" as const, id: t._id, text: t.text, category: t.category ?? "other" })),
      ...recurring.map((t) => ({ type: "recurring" as const, id: t._id, text: t.text, category: "other" as const })),
    ];
    return Response.json(result);
  }),
});

// POST /agent/v1/todos-star — set star values on todos or recurring templates
http.route({
  path: "/agent/v1/todos-star",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { ratings } = await req.json();
    for (const rating of ratings) {
      if (rating.type === "todo") {
        await ctx.runMutation(internal.todos.setTodoStarValue, {
          id: rating.id,
          starValue: rating.starValue,
        });
      } else {
        await ctx.runMutation(internal.recurringTodos.setStarValue, {
          id: rating.id,
          starValue: rating.starValue,
        });
      }
    }
    return Response.json({ ok: true, rated: ratings.length });
  }),
});

// GET /agent/v1/quests-work — returns users with their recurring todos
http.route({
  path: "/agent/v1/quests-work",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const users = await ctx.runQuery(internal.quests.getUsersWithRecurring);
    return Response.json(users);
  }),
});

// POST /agent/v1/quests-save — upsert AI-generated quests
http.route({
  path: "/agent/v1/quests-save",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { quests } = await req.json();
    for (const quest of quests) {
      await ctx.runMutation(internal.quests.upsertQuest, quest);
    }
    return Response.json({ ok: true, saved: quests.length });
  }),
});

// GET /agent/v1/notify-due — recurring todos with nextDueAt <= now + their push subscriptions
http.route({
  path: "/agent/v1/notify-due",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const due = await ctx.runQuery(internal.todos.getDueRecurringTodos);
    return Response.json(due);
  }),
});

// POST /agent/v1/notify-reset — reset a recurring todo after notification sent
http.route({
  path: "/agent/v1/notify-reset",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { todoId } = await req.json();
    await ctx.runMutation(internal.todos.resetRecurringTodo, { id: todoId });
    return Response.json({ ok: true });
  }),
});

// GET /agent/v1/uploads-unprocessed — image uploads not yet described/compressed
http.route({
  path: "/agent/v1/uploads-unprocessed",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const images = await ctx.runQuery(internal.uploads.listUnprocessedImages);
    return Response.json(images);
  }),
});

// POST /agent/v1/uploads-process — receive compressed image + description from agent
// Body: { id, description, imageBase64, mimeType, size }
http.route({
  path: "/agent/v1/uploads-process",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!verifyAgentSecret(req)) return new Response("Unauthorized", { status: 401 });
    const { id, description, imageBase64, mimeType, size } = await req.json();
    // Get a fresh upload URL for the compressed image
    const uploadUrl = await ctx.runMutation(internal.uploads.generateUploadUrlInternal);
    // Decode base64 → binary
    const binary = atob(imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // Upload to Convex storage
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: bytes,
    });
    if (!uploadRes.ok) return new Response("Storage upload failed", { status: 500 });
    const { storageId: newStorageId } = await uploadRes.json();
    // Replace original, store description
    await ctx.runMutation(internal.uploads.processImage, { id, newStorageId, description, size });
    return Response.json({ ok: true });
  }),
});

export default http;

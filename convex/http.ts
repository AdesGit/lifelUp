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

export default http;

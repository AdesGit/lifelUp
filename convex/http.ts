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

export default http;

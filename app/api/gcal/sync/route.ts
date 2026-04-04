import { NextResponse } from "next/server";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const AGENT_SECRET = process.env.AGENT_SECRET!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const agentHeaders = {
  Authorization: `Bearer ${AGENT_SECRET}`,
  "Content-Type": "application/json",
};

async function convexGet(path: string) {
  const res = await fetch(`${CONVEX_URL}${path}`, { headers: agentHeaders });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function convexPost(path: string, body: unknown) {
  const res = await fetch(`${CONVEX_URL}${path}`, {
    method: "POST",
    headers: agentHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function ensureFreshToken(token: {
  userId: string; accessToken: string; refreshToken: string; expiresAt: number;
}) {
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const { access_token, expires_in } = await res.json();
  const expiresAt = Date.now() + expires_in * 1000;
  await convexPost("/agent/v1/gcal-tokens-update", { userId: token.userId, accessToken: access_token, expiresAt });
  return access_token as string;
}

function todoToEvent(todo: { text: string; dueAt: number }) {
  const start = new Date(todo.dueAt).toISOString().split("T")[0];
  return { summary: todo.text, start: { date: start }, end: { date: start } };
}

export async function POST() {
  try {
    const tokens: {
      userId: string; accessToken: string; refreshToken: string; expiresAt: number;
      googleEmail: string; calendarId: string; lastSyncAt?: number;
    }[] = await convexGet("/agent/v1/gcal-tokens");

    for (const token of tokens) {
      const accessToken = await ensureFreshToken(token);
      const gcalHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      const calendarBase = `https://www.googleapis.com/calendar/v3/calendars/${token.calendarId}`;

      const todos: {
        _id: string; _creationTime: number; text: string; dueAt: number;
        gcalEventId?: string; gcalUpdatedAt?: number; lifelupUpdatedAt?: number; completed: boolean;
      }[] = await convexGet(`/agent/v1/gcal-todos?userId=${token.userId}`);

      // LifeLup → GCal
      for (const todo of todos) {
        if (todo.completed && todo.gcalEventId) {
          await fetch(`${calendarBase}/events/${todo.gcalEventId}`, { method: "DELETE", headers: gcalHeaders });
          await convexPost("/agent/v1/gcal-todo-update", { id: todo._id, gcalEventId: "", gcalUpdatedAt: 0 });
        } else if (!todo.gcalEventId) {
          const res = await fetch(`${calendarBase}/events`, {
            method: "POST", headers: gcalHeaders, body: JSON.stringify(todoToEvent(todo)),
          });
          const event = await res.json();
          if (!event.id) continue;
          await convexPost("/agent/v1/gcal-todo-update", {
            id: todo._id, gcalEventId: event.id, gcalUpdatedAt: new Date(event.updated).getTime(),
          });
        } else {
          const lifelupEditedAt = todo.lifelupUpdatedAt ?? 0;
          if (lifelupEditedAt > (todo.gcalUpdatedAt ?? 0)) {
            const res = await fetch(`${calendarBase}/events/${todo.gcalEventId}`, {
              method: "PATCH", headers: gcalHeaders, body: JSON.stringify(todoToEvent(todo)),
            });
            const event = await res.json();
            if (!event.id) continue;
            await convexPost("/agent/v1/gcal-todo-update", {
              id: todo._id, gcalEventId: event.id, gcalUpdatedAt: new Date(event.updated).getTime(),
            });
          }
        }
      }

      // GCal → LifeLup
      const updatedMin = token.lastSyncAt
        ? new Date(token.lastSyncAt).toISOString()
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const gcalRes = await fetch(
        `${calendarBase}/events?updatedMin=${encodeURIComponent(updatedMin)}&singleEvents=true&maxResults=50`,
        { headers: gcalHeaders }
      );
      const { items = [] } = await gcalRes.json();
      const existingGcalIds = new Set(todos.filter(t => t.gcalEventId).map(t => t.gcalEventId));

      for (const event of items) {
        if (event.status === "cancelled") continue;
        const gcalUpdatedAt = new Date(event.updated).getTime();
        const dueAt = event.start?.dateTime
          ? new Date(event.start.dateTime).getTime()
          : event.start?.date ? new Date(event.start.date).getTime() : null;
        if (!dueAt) continue;

        if (!existingGcalIds.has(event.id)) {
          await convexPost("/agent/v1/gcal-todo-create", {
            userId: token.userId, text: event.summary ?? "(Sans titre)",
            dueAt, gcalEventId: event.id, gcalUpdatedAt: Date.now(),
          });
        } else {
          const matchingTodo = todos.find(t => t.gcalEventId === event.id);
          if (matchingTodo && gcalUpdatedAt > (matchingTodo.gcalUpdatedAt ?? 0)) {
            await convexPost("/agent/v1/gcal-todo-update", {
              id: matchingTodo._id, gcalEventId: event.id, gcalUpdatedAt,
            });
          }
        }
      }

      await convexPost("/agent/v1/gcal-sync-done", { userId: token.userId, lastSyncAt: Date.now() });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gcal-sync-route]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

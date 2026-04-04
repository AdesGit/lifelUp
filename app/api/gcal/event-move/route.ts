import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const AGENT_SECRET = process.env.AGENT_SECRET!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const agentHeaders = {
  Authorization: `Bearer ${AGENT_SECRET}`,
  "Content-Type": "application/json",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    todoId,
    newDueAt,
    userId,
    gcalEventId,
    calendarId,
    accessToken,
    expiresAt,
    refreshToken,
  } = body as {
    todoId: string;
    newDueAt: number;
    userId: string;
    gcalEventId?: string;
    calendarId?: string;
    accessToken?: string;
    expiresAt?: number;
    refreshToken?: string;
  };

  // 1. Update dueAt in Convex via internal endpoint
  await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-todo-due-update`, {
    method: "POST",
    headers: agentHeaders,
    body: JSON.stringify({ id: todoId, dueAt: newDueAt }),
  });

  // 2. If no gcalEventId, nothing to patch in GCal
  if (!gcalEventId || !calendarId || !accessToken || !refreshToken || expiresAt === undefined) {
    return NextResponse.json({ ok: true, gcalPatched: false });
  }

  // 3. Refresh token if expiring soon
  let currentAccessToken = accessToken;
  if (expiresAt <= Date.now() + 60_000) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token: string; expires_in: number };
    currentAccessToken = tokenData.access_token;
    // Update token in Convex
    await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-tokens-update`, {
      method: "POST",
      headers: agentHeaders,
      body: JSON.stringify({
        userId,
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      }),
    });
  }

  // 4. PATCH GCal event with new date
  const newDate = new Date(newDueAt);
  const startDate = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}-${String(newDate.getDate()).padStart(2, "0")}`;
  const gcalRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${gcalEventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${currentAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { date: startDate },
        end: { date: startDate },
      }),
    }
  );

  if (!gcalRes.ok) {
    const errText = await gcalRes.text();
    console.error("GCal PATCH failed:", gcalRes.status, errText);
    return NextResponse.json({ ok: true, gcalPatched: false, error: errText });
  }

  const gcalResult = await gcalRes.json() as { updated?: string; id?: string };

  // Update gcalUpdatedAt with new GCal timestamp
  if (gcalResult.updated) {
    await fetch(`${CONVEX_SITE_URL}/agent/v1/gcal-todo-update`, {
      method: "POST",
      headers: agentHeaders,
      body: JSON.stringify({
        id: todoId,
        gcalEventId,
        gcalUpdatedAt: new Date(gcalResult.updated).getTime(),
      }),
    });
  }

  return NextResponse.json({ ok: true, gcalPatched: true });
}

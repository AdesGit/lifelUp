import { NextRequest, NextResponse } from "next/server";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export async function GET(req: NextRequest) {
  // Derive the public base URL at runtime from GOOGLE_REDIRECT_URI to avoid
  // localhost leaking through the Nginx reverse proxy (req.url shows localhost:3000).
  const APP_BASE_URL = new URL(GOOGLE_REDIRECT_URI).origin;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // base64(userId)
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/integrations?error=oauth_denied", APP_BASE_URL));
  }

  // Decode userId + LifeLup email from state (encoded as base64 JSON)
  let userId: string;
  let googleEmail: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    userId = decoded.userId;
    googleEmail = decoded.email;
  } catch {
    return NextResponse.redirect(new URL("/integrations?error=oauth_denied", APP_BASE_URL));
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/integrations?error=token_exchange", APP_BASE_URL));
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  // Store token in Convex via the agent HTTP endpoint
  const agentSecret = process.env.AGENT_SECRET!;
  const saveRes = await fetch(`${CONVEX_URL}/agent/v1/gcal-oauth-save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentSecret}`,
    },
    body: JSON.stringify({
      userId,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      googleEmail,
      calendarId: "primary",
    }),
  });

  if (!saveRes.ok) {
    const body = await saveRes.text().catch(() => "(no body)");
    console.error("[gcal-callback] Failed to save token. Status:", saveRes.status, "Body:", body);
    console.error("[gcal-callback] userId:", userId, "email:", googleEmail);
    return NextResponse.redirect(new URL("/integrations?error=save_failed", APP_BASE_URL));
  }

  return NextResponse.redirect(new URL("/integrations?connected=true", APP_BASE_URL));
}

/**
 * PATTERN: PM2 polling agent script
 *
 * Extracted from lifelup-agent/coach-poll.mjs — the canonical template for
 * real-time polling agents that run as PM2 processes.
 *
 * Use this pattern when you need:
 * - Sub-minute response times (< 60s) — use polling
 * - Daily/weekly batch jobs — use RemoteTrigger (claude.ai/code/scheduled) instead
 *
 * Key rules:
 * - AGENT_SECRET is hardcoded here, not read from process.env
 *   Why: PM2 ecosystem.config.cjs defines env, but the agent is NOT restarted
 *   with --update-env (that wipes ANTHROPIC_API_KEY). The secret is not sensitive
 *   enough to require rotation and is already in convex/http.ts and git history.
 * - ANTHROPIC_API_KEY is read from process.env (injected by PM2 from ecosystem.config.cjs)
 * - setInterval + immediate poll() call = starts polling immediately, no waiting
 * - Per-session try/catch = one failed session doesn't kill the whole poll cycle
 * - PM2 captures stdout/stderr — use console.log/console.error liberally
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const CONVEX_URL = "https://convex.aidigitalassistant.cloud";

// Hardcoded — see rationale above. This is the AGENT_SECRET Convex env var value.
const AGENT_SECRET = "de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4";

// How often to poll. 15s is a good balance between responsiveness and API cost.
// Increase for batch-ish workloads, decrease if sub-15s response is needed.
const POLL_INTERVAL_MS = 15_000;

const headers = {
  "Authorization": `Bearer ${AGENT_SECRET}`,
  "Content-Type": "application/json",
};

// ─── Convex API calls ─────────────────────────────────────────────────────────

/**
 * Fetch work items from Convex.
 * Returns an array — empty array means nothing to do this poll cycle.
 * Throws on non-200 so the outer poll() catch can log it.
 */
async function getWorkItems() {
  const res = await fetch(`${CONVEX_URL}/agent/v1/pending`, { headers }); // TODO: replace path
  if (!res.ok) throw new Error(`GET work-items failed: ${res.status}`);
  return res.json();
}

/**
 * Save the result back to Convex.
 * Called once per processed item inside the per-item try/catch.
 */
async function saveResult(sessionId, userId, content) {
  const res = await fetch(`${CONVEX_URL}/agent/v1/reply`, { // TODO: replace path
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId, userId, content }),
  });
  if (!res.ok) throw new Error(`POST result failed: ${res.status}`);
}

// ─── LLM call ────────────────────────────────────────────────────────────────

/**
 * Call Anthropic API for a single work item.
 * ANTHROPIC_API_KEY is read from process.env — injected by PM2 at start time.
 * If it's missing, this throws immediately with a clear error message.
 */
async function generateResponse(workItem) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set in PM2 env");

  // TODO: Build your system prompt and messages array from workItem
  const systemPrompt = `...`; // build from workItem fields
  const messages = workItem.history.map(m => ({ role: m.role, content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",  // haiku for speed; use sonnet-4-6 for quality-sensitive tasks
      max_tokens: 300,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ─── Poll cycle ───────────────────────────────────────────────────────────────

/**
 * Single poll cycle:
 * 1. Fetch work items
 * 2. If none, return silently (no log spam for empty polls)
 * 3. For each item: generate + save, with per-item error isolation
 *
 * The outer try/catch handles complete poll failures (network down, Convex down).
 * The inner try/catch handles per-item failures without killing the whole cycle.
 */
async function poll() {
  try {
    const items = await getWorkItems();
    if (!items.length) return;  // silent — don't log empty polls

    console.log(`[agent] ${items.length} item(s) at ${new Date().toISOString()}`);

    for (const item of items) {
      try {
        const response = await generateResponse(item);
        await saveResult(item.sessionId, item.userId, response);
        console.log(`[agent] Processed item for ${item.userEmail ?? item.userId}`);
      } catch (err) {
        // Per-item error — log and continue. Don't let one bad item kill the cycle.
        console.error(`[agent] Failed for ${item.userEmail ?? item.userId}:`, err.message);
      }
    }
  } catch (err) {
    // Poll-level error (network, Convex down, etc.)
    console.error("[agent] Poll error:", err.message);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

// Run immediately on startup (don't wait POLL_INTERVAL_MS for first run)
poll();

// Then run on interval
setInterval(poll, POLL_INTERVAL_MS);

console.log(`[agent] Started. Polling every ${POLL_INTERVAL_MS / 1000}s`);

// ─── PM2 ecosystem.config.cjs entry (for reference) ──────────────────────────
/*
  {
    name: "lifelup-agent-name",
    script: "/home/claude/dev/lifelup-agent/your-agent.mjs",
    interpreter: "node",
    env: {
      ANTHROPIC_API_KEY: "sk-ant-...",
    },
    restart_delay: 5000,
    max_restarts: 10,
  }

  To start:
    pm2 start ecosystem.config.cjs --only lifelup-agent-name
    pm2 save

  To restart after code changes (NEVER use --update-env — it wipes ANTHROPIC_API_KEY):
    pm2 delete lifelup-agent-name
    pm2 start ecosystem.config.cjs --only lifelup-agent-name
    pm2 save
*/

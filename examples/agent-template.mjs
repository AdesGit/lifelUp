/**
 * LifeLup Agent Template
 * Copy this file to /home/claude/dev/lifelup-agent/[name]-agent.mjs
 * and adapt the 4 sections marked with ← CUSTOMIZE.
 *
 * Architecture: Fetch context from Convex → claude --print → Save results to Convex
 * No Anthropic API key needed — uses Claude Code's own authentication.
 */
import { execFileSync } from "child_process";

// ── Config ────────────────────────────────────────────────────────────────────
const CONVEX_URL = "https://convex.aidigitalassistant.cloud";
const AGENT_SECRET = process.env.AGENT_SECRET ?? "de5430144a6a5bebe12f68b99880fff0a761a37dbf7917ca8eb2f70c9416aec4";
const CLAUDE_BIN = "/home/claude/.local/bin/claude";
const AGENT_NAME = "[agent-name]"; // ← CUSTOMIZE
const POLL_MS = 5 * 60 * 1000;    // ← CUSTOMIZE: polling interval in ms

// ── 1. Instructions (hardcoded or fetched from Convex) ───────────────────────
// Option A: hardcoded
const INSTRUCTIONS = `
Tu es l'agent LifeLup [description].   ← CUSTOMIZE

Ton travail :
1. [étape 1]
2. [étape 2]

Réponds UNIQUEMENT avec un tableau JSON valide :
[{"field": "value", ...}, ...]
`; // ← CUSTOMIZE

// Option B: fetch from Convex (for dynamic instructions without redeployment)
// async function fetchInstructions() {
//   const res = await fetch(`${CONVEX_URL}/agent/v1/[instructions-endpoint]`, {
//     headers: { Authorization: `Bearer ${AGENT_SECRET}` },
//   });
//   return res.json(); // returns { prompt: "..." }
// }

// ── 2. Fetch context from Convex ─────────────────────────────────────────────
async function fetchWork() {
  const res = await fetch(`${CONVEX_URL}/agent/v1/[work-endpoint]`, { // ← CUSTOMIZE
    headers: { Authorization: `Bearer ${AGENT_SECRET}` },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── 3. Call Claude Code CLI ───────────────────────────────────────────────────
function runClaude(context) {
  const prompt = [
    INSTRUCTIONS,
    "",
    "Données actuelles :",
    JSON.stringify(context, null, 2),
  ].join("\n");

  const output = execFileSync(CLAUDE_BIN, ["--print", prompt], {
    encoding: "utf8",
    timeout: 90_000,
  });

  // Extract JSON from output (Claude may add explanation text)
  const match = output.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON found in output: ${output.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// ── 4. Save results to Convex ─────────────────────────────────────────────────
async function saveResults(results) {
  const res = await fetch(`${CONVEX_URL}/agent/v1/[save-endpoint]`, { // ← CUSTOMIZE
    method: "POST",
    headers: {
      Authorization: `Bearer ${AGENT_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(results), // ← CUSTOMIZE: wrap as needed e.g. { items: results }
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
async function poll() {
  try {
    const work = await fetchWork();
    if (!work?.length) return; // nothing to do

    console.log(`[${AGENT_NAME}] ${new Date().toISOString()} — processing ${work.length} item(s)`);

    const results = runClaude(work);
    const saved = await saveResults(results);
    console.log(`[${AGENT_NAME}] saved:`, JSON.stringify(saved));
  } catch (err) {
    console.error(`[${AGENT_NAME}] error:`, err.message);
  }
}

poll();
setInterval(poll, POLL_MS);
console.log(`[${AGENT_NAME}] started — polling every ${POLL_MS / 1000}s (Claude Code CLI)`);

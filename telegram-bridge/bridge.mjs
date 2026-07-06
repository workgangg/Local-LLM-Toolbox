#!/usr/bin/env node
// telegram-bridge/bridge.mjs -- Sandboxed Telegram -> agent-api bridge.
//
// INERT scaffolding. Service is gated behind docker-compose profile
// `telegram` and will refuse to start without a populated .env file.
// Activation checklist:
//   1. cp telegram-bridge/.env.example telegram-bridge/.env
//   2. Set TELEGRAM_BOT_TOKEN (from @BotFather)
//   3. Set TELEGRAM_ALLOWED_USER_IDS (comma-separated Telegram user IDs)
//   4. docker compose --profile telegram up -d telegram-bridge
//
// Safety primitives (hardcoded -- NOT overridable from inbound messages):
//   - Preset: telegram-assistant (sandboxed; no shell, writes confined
//     to inbox/ and reports/ via sandboxed_write_file).
//   - Target CWD: /workspace/projects
//   - Agent URL: http://agent-api:3777/api/run (Docker network only)
//   - Sender allowlist via TELEGRAM_ALLOWED_USER_IDS
//   - Rate limit: RATE_MAX messages per RATE_WINDOW_MS per user
//   - Reply truncated to REPLY_MAX_LEN chars
//   - Every dispatch, denial, and error recorded to dispatch.log

import { appendFile } from "node:fs/promises";
import { getHistory, appendTurn, resetUser, buildPrompt } from "./memory.mjs";

// ── Config ────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);
const AGENT_URL = process.env.AGENT_URL || "http://agent-api:3777/api/run";
const PRESET = "telegram-assistant";
const CWD = "/workspace/projects";
const LOG_PATH = "/workspace/telegram-bridge/dispatch.log";
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const POLL_TIMEOUT_SEC = 30;
const REPLY_MAX_LEN = 4000;

// ── Startup validation (fail fast) ────────────────────────────────────
if (!TOKEN) {
  console.error("FATAL: TELEGRAM_BOT_TOKEN not set. Bridge refuses to start.");
  process.exit(1);
}
if (ALLOWED.length === 0 || ALLOWED.some(Number.isNaN)) {
  console.error(
    "FATAL: TELEGRAM_ALLOWED_USER_IDS is empty or invalid. Bridge refuses to start."
  );
  process.exit(1);
}

console.log(`[bridge] preset=${PRESET} agent=${AGENT_URL} cwd=${CWD}`);
console.log(`[bridge] allowlist: ${ALLOWED.join(", ")}`);
console.log(
  `[bridge] rate limit: ${RATE_MAX} msg / ${RATE_WINDOW_MS / 1000}s per user`
);

// ── Rate limiter ──────────────────────────────────────────────────────
const rate = new Map();
function rateAllow(userId) {
  const now = Date.now();
  const hits = (rate.get(userId) || []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (hits.length >= RATE_MAX) return false;
  hits.push(now);
  rate.set(userId, hits);
  return true;
}

// ── Audit log ─────────────────────────────────────────────────────────
async function log(line) {
  const ts = new Date().toISOString();
  try {
    await appendFile(LOG_PATH, `${ts} ${line}\n`);
  } catch (e) {
    console.error(`[bridge] log append failed: ${e.message}`);
  }
}

// ── Telegram API ──────────────────────────────────────────────────────
const TG_BASE = `https://api.telegram.org/bot${TOKEN}`;

async function tgRequest(method, body) {
  const res = await fetch(`${TG_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  }
  return json.result;
}

async function sendMessage(chatId, text) {
  const truncated =
    text.length > REPLY_MAX_LEN
      ? text.slice(0, REPLY_MAX_LEN - 20) + "\n\n[...truncated]"
      : text;
  return tgRequest("sendMessage", { chat_id: chatId, text: truncated });
}

// ── Agent dispatch ────────────────────────────────────────────────────
async function dispatchToAgent(prompt) {
  const res = await fetch(AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: PRESET, prompt, cwd: CWD }),
  });
  if (!res.ok) throw new Error(`agent-api returned HTTP ${res.status}`);
  return await res.json();
}

// ── Update handler ────────────────────────────────────────────────────
async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const userId = msg.from?.id;
  const chatId = msg.chat?.id;
  const preview = msg.text.slice(0, 120).replace(/\s+/g, " ");

  if (!ALLOWED.includes(userId)) {
    // Silent drop -- do not acknowledge strangers.
    await log(
      `DENIED_ALLOWLIST userId=${userId} chat=${chatId} text=${JSON.stringify(preview)}`
    );
    return;
  }

  if (!rateAllow(userId)) {
    await log(`DENIED_RATE userId=${userId} chat=${chatId}`);
    await sendMessage(chatId, "Rate limit: try again in a minute.").catch(
      () => {}
    );
    return;
  }

  // /reset -- wipe this user's conversation history. Matched before dispatch
  // so it works even if the bot is stuck or slow.
  if (msg.text.trim().toLowerCase() === "/reset") {
    await resetUser(userId);
    await log(`RESET userId=${userId}`);
    await sendMessage(chatId, "Memory cleared. Starting fresh.").catch(() => {});
    return;
  }

  await log(
    `DISPATCH userId=${userId} chat=${chatId} text=${JSON.stringify(preview)}`
  );
  try {
    const history = await getHistory(userId);
    const contextPrompt = buildPrompt(history, msg.text);
    const result = await dispatchToAgent(contextPrompt);
    const reply = (result.response || "").trim() || "(no response)";
    await appendTurn(userId, msg.text, reply);
    await log(
      `RESPONSE userId=${userId} turns=${result.turns} tools=${(result.tools_used || []).join("|")} history_in=${history.length} len=${reply.length}`
    );
    await sendMessage(chatId, reply);
  } catch (err) {
    await log(`ERROR userId=${userId} err=${err.message}`);
    await sendMessage(
      chatId,
      "Error processing request. Check bridge logs."
    ).catch(() => {});
  }
}

// ── Long-poll loop ────────────────────────────────────────────────────
async function pollLoop() {
  let offset = 0;
  while (true) {
    try {
      const updates = await tgRequest("getUpdates", {
        offset,
        timeout: POLL_TIMEOUT_SEC,
      });
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        handleUpdate(update).catch((e) => log(`UNCAUGHT ${e.message}`));
      }
    } catch (e) {
      console.error(`[bridge] poll error: ${e.message} -- backing off 5s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

await log(`BRIDGE_START pid=${process.pid} allowlist=${ALLOWED.join("|")}`);
pollLoop();

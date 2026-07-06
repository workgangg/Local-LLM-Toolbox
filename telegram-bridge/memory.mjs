// telegram-bridge/memory.mjs -- Per-user conversation memory.
//
// One JSON file per user. File name is the Telegram user ID. Writes use a
// temp-file + rename pattern so an interrupted write never corrupts the
// history. Idle users (no activity for IDLE_EXPIRY_MS) get their history
// dropped on the next read -- no sweeper process needed.
//
// Shape of each file:
//   { "lastSeen": 1745248200000, "messages": [
//       { "role": "user",      "content": "..." },
//       { "role": "assistant", "content": "..." },
//       ...
//     ]
//   }
//
// Kept simple on purpose: small allowlist, one message in flight per user,
// no concurrent writes. If this grows past a handful of users, swap the
// backing store for SQLite without changing the exports.

import { readFile, writeFile, mkdir, unlink, rename } from "node:fs/promises";
import { join } from "node:path";

const DIR = "/workspace/telegram-bridge/memory";
const MAX_TURNS = 10;                       // last N (user, assistant) pairs
const IDLE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

function fileFor(userId) {
  return join(DIR, `${userId}.json`);
}

async function ensureDir() {
  await mkdir(DIR, { recursive: true });
}

export async function getHistory(userId) {
  await ensureDir();
  const path = fileFor(userId);
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  if (Date.now() - (data.lastSeen || 0) > IDLE_EXPIRY_MS) {
    await unlink(path).catch(() => {});
    return [];
  }
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function appendTurn(userId, userText, assistantText) {
  await ensureDir();
  const prev = await getHistory(userId);
  const next = [
    ...prev,
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ].slice(-MAX_TURNS * 2);
  const path = fileFor(userId);
  const tmp = `${path}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify({ lastSeen: Date.now(), messages: next })
  );
  await rename(tmp, path);
}

export async function resetUser(userId) {
  try {
    await unlink(fileFor(userId));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

// Build the context-prefixed prompt the agent actually sees. Past turns
// are presented as prior-conversation context; the new message is clearly
// labelled so the model knows which part to respond to.
export function buildPrompt(history, currentMessage) {
  if (!history.length) return currentMessage;
  const lines = ["Previous conversation with this user (context only):"];
  for (const m of history) {
    const who = m.role === "user" ? "User" : "You";
    lines.push(`${who}: ${m.content}`);
  }
  lines.push("");
  lines.push("User's current message:");
  lines.push(currentMessage);
  return lines.join("\n");
}

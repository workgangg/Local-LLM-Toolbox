// localagent/runner.mjs — Core agent loop.
// Sends messages to Ollama, handles tool calls, loops until the model
// produces a final text response or hits the turn limit.

import { toolDefinitions, executeTool } from "./tools.mjs";
import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "presets");

// ── Preset Helpers ────────────────────────────────────────────────────

export async function loadPreset(name) {
  const path = join(PRESETS_DIR, `${name}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

export async function listPresets() {
  const files = await readdir(PRESETS_DIR);
  const presets = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(await readFile(join(PRESETS_DIR, f), "utf8"));
    presets.push({
      name: data.name,
      description: data.description,
      model: data.model,
      online: data.online || false,
      tools: data.tools,
    });
  }
  return presets;
}

// ── Agent Runner ──────────────────────────────────────────────────────

/**
 * Run a full agent conversation loop.
 *
 * @param {object}   config       Agent config (from preset or custom)
 * @param {string}   userPrompt   The user's task / question
 * @param {object}   [options]
 * @param {string}   [options.ollamaHost]  Ollama base URL
 * @param {string}   [options.cwd]         Working directory for tools
 * @param {number}   [options.maxTurns]    Override config.max_turns
 * @param {function} [options.onText]      Called with assistant text
 * @param {function} [options.onToolCall]  Called with (toolName, args)
 * @param {function} [options.onToolResult] Called with (toolName, result)
 * @param {function} [options.onTurn]      Called with turn number
 *
 * @returns {{ response, turns, tools_used, truncated, messages }}
 */
export async function runAgent(config, userPrompt, options = {}) {
  const {
    ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434",
    cwd = process.cwd(),
    maxTurns = config.max_turns || 10,
    onText = () => {},
    onToolCall = () => {},
    onToolResult = () => {},
    onTurn = () => {},
  } = options;

  const messages = [
    { role: "system", content: config.system },
    { role: "user", content: userPrompt },
  ];

  // Build Ollama-format tool list from the config's tool names
  const ollamaTools = (config.tools || [])
    .map((name) => {
      const def = toolDefinitions[name];
      if (!def) return null;
      return {
        type: "function",
        function: {
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        },
      };
    })
    .filter(Boolean);

  let totalTurns = 0;
  const toolsUsed = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    totalTurns++;
    onTurn(turn);

    const body = {
      model: config.model,
      messages,
      stream: false,
    };
    if (ollamaTools.length > 0) body.tools = ollamaTools;

    let response;
    try {
      response = await fetch(`${ollamaHost}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Cannot reach Ollama at ${ollamaHost} — is it running? (${err.message})`
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    const msg = data.message;
    messages.push(msg);

    if (msg.content) onText(msg.content);

    // No tool calls → final response, we're done
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        response: msg.content || "",
        turns: totalTurns,
        tools_used: [...new Set(toolsUsed)],
        truncated: false,
        messages,
      };
    }

    // Execute each tool call
    for (const call of msg.tool_calls) {
      const toolName = call.function.name;
      const toolArgs = call.function.arguments;

      onToolCall(toolName, toolArgs);
      toolsUsed.push(toolName);

      try {
        const result = await executeTool(toolName, toolArgs, { cwd });
        const resultStr =
          typeof result === "string" ? result : JSON.stringify(result);
        onToolResult(toolName, resultStr);
        messages.push({ role: "tool", content: resultStr });
      } catch (err) {
        const errMsg = `Error in ${toolName}: ${err.message}`;
        onToolResult(toolName, errMsg);
        messages.push({ role: "tool", content: errMsg });
      }
    }
  }

  // Exceeded max turns — return whatever we have
  const last = messages.filter((m) => m.role === "assistant").pop();
  return {
    response:
      last?.content || "[Agent reached maximum turns without a final response]",
    turns: totalTurns,
    tools_used: [...new Set(toolsUsed)],
    truncated: true,
    messages,
  };
}

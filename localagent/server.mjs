#!/usr/bin/env node
// localagent/server.mjs — HTTP API for programmatic agent dispatch.
//
// Endpoints:
//   GET  /health       Health check
//   GET  /api/agents   List available agent presets
//   GET  /api/models   List Ollama models (proxy)
//   POST /api/run      Run an agent and return the result
//
// POST /api/run body:
//   {
//     "agent": "git-commit",         // Preset name (OR use "system" for custom)
//     "prompt": "...",               // User prompt
//     "model": "gemma4:e4b",        // Optional: override model
//     "cwd": "/workspace/projects",  // Optional: working directory
//     "max_turns": 10,               // Optional: override turn limit
//     "system": "You are...",        // Optional: custom system prompt (instead of preset)
//     "tools": ["read_file", ...]    // Optional: tool list (with custom system)
//   }
//
// Environment:
//   OLLAMA_HOST   Ollama base URL (default: http://localhost:11434)
//   AGENT_PORT    Server port (default: 3777)
//   AGENT_HOST    Bind address (default: 0.0.0.0)

import http from "http";
import { runAgent, loadPreset, listPresets } from "./runner.mjs";

const PORT = parseInt(process.env.AGENT_PORT || "3777", 10);
const HOST = process.env.AGENT_HOST || "0.0.0.0";
const OLLAMA = process.env.OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_CWD = process.env.AGENT_CWD || "/workspace/projects";

// ── Helpers ───────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data, null, 2));
}

// ── Request Handler ───────────────────────────────────────────────────

async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // ── GET /health ─────────────────────────────────────────────
    if (url.pathname === "/health") {
      return json(res, 200, {
        status: "ok",
        service: "localagent",
        ollama: OLLAMA,
      });
    }

    // ── GET /api/agents ─────────────────────────────────────────
    if (url.pathname === "/api/agents" && req.method === "GET") {
      return json(res, 200, { agents: await listPresets() });
    }

    // ── GET /api/models ─────────────────────────────────────────
    if (url.pathname === "/api/models" && req.method === "GET") {
      const resp = await fetch(`${OLLAMA}/api/tags`);
      return json(res, 200, await resp.json());
    }

    // ── POST /api/run ───────────────────────────────────────────
    if (url.pathname === "/api/run" && req.method === "POST") {
      const body = await parseBody(req);

      if (!body.agent && !body.system) {
        return json(res, 400, {
          error:
            'Provide "agent" (preset name) or "system" (custom system prompt)',
          available: (await listPresets()).map((p) => p.name),
        });
      }

      // Build config from preset or custom params
      let config;
      if (body.agent) {
        try {
          config = await loadPreset(body.agent);
        } catch {
          return json(res, 400, {
            error: `Unknown preset: ${body.agent}`,
            available: (await listPresets()).map((p) => p.name),
          });
        }
        if (body.model) config.model = body.model;
        if (body.max_turns) config.max_turns = body.max_turns;
        if (body.tools) config.tools = body.tools;
      } else {
        config = {
          name: "custom",
          model: body.model || "gemma4:e4b",
          system: body.system,
          tools: body.tools || [],
          max_turns: body.max_turns || 10,
        };
      }

      const prompt = body.prompt || config.default_prompt || "Hello";
      const startTime = Date.now();

      const result = await runAgent(config, prompt, {
        cwd: body.cwd || DEFAULT_CWD,
        ollamaHost: OLLAMA,
      });

      return json(res, 200, {
        agent: config.name,
        model: config.model,
        response: result.response,
        turns: result.turns,
        tools_used: result.tools_used,
        truncated: result.truncated,
        elapsed_ms: Date.now() - startTime,
      });
    }

    // ── 404 ─────────────────────────────────────────────────────
    json(res, 404, {
      error: "Not found",
      endpoints: [
        "GET  /health",
        "GET  /api/agents",
        "GET  /api/models",
        "POST /api/run",
      ],
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
    json(res, 500, { error: err.message });
  }
}

// ── Start ─────────────────────────────────────────────────────────────

const server = http.createServer(handler);

server.listen(PORT, HOST, () => {
  console.log(`localagent API listening on http://${HOST}:${PORT}`);
  console.log(`Ollama endpoint: ${OLLAMA}`);
  console.log(`Default CWD: ${DEFAULT_CWD}`);
  console.log();
  console.log("Endpoints:");
  console.log("  GET  /health       — Health check");
  console.log("  GET  /api/agents   — List agent presets");
  console.log("  GET  /api/models   — List Ollama models");
  console.log('  POST /api/run      — Run an agent (body: {agent, prompt})');
  console.log();
});

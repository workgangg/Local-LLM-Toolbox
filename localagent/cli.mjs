#!/usr/bin/env node
// localagent/cli.mjs — CLI entry point for running agents.
//
// Usage:
//   node cli.mjs <preset> [prompt]        Run a preset agent
//   node cli.mjs --list                   List available presets
//   node cli.mjs --help                   Show help
//
// Examples:
//   node cli.mjs git-commit
//   node cli.mjs coder "Add input validation to server.mjs"
//   node cli.mjs doc-processor "Summarize all markdown files"
//   node cli.mjs job-scanner "Search these URLs: ..."
//
// Environment:
//   OLLAMA_HOST   Ollama URL (default: http://localhost:11434)
//   AGENT_CWD     Working directory for tools (default: current directory)

import { runAgent, loadPreset, listPresets } from "./runner.mjs";

// ── Helpers ───────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function printHelp() {
  console.log(`
${BOLD}localagent${RESET} — Run AI agents locally via Ollama

${BOLD}Usage:${RESET}
  localagent <preset> [prompt]     Run a preset agent
  localagent --list                List available agent presets
  localagent --help                Show this help

${BOLD}Presets:${RESET}
  git-commit      Generate a commit message from your current diff
  doc-processor   Read, summarize, and analyze documents
  job-scanner     Fetch and analyze job listings (online)
  coder           General-purpose coding assistant

${BOLD}Options:${RESET}
  --model <name>  Override the preset's model
  --cwd <path>    Set the working directory for tools
  --turns <n>     Override maximum tool-call turns

${BOLD}Environment:${RESET}
  OLLAMA_HOST     Ollama base URL (default: http://localhost:11434)

${BOLD}Examples:${RESET}
  localagent git-commit
  localagent coder "Fix the broken import in utils.js"
  localagent doc-processor "Summarize README.md"
  localagent job-scanner --model grm-2.5 "Check https://..."
`);
}

// ── Argument Parsing ──────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { preset: null, prompt: null, model: null, cwd: null, turns: null };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--list" || arg === "-l") {
      return { ...opts, list: true };
    } else if (arg === "--model" && args[i + 1]) {
      opts.model = args[++i];
    } else if (arg === "--cwd" && args[i + 1]) {
      opts.cwd = args[++i];
    } else if (arg === "--turns" && args[i + 1]) {
      opts.turns = parseInt(args[++i], 10);
    } else if (!arg.startsWith("--") && !opts.preset) {
      opts.preset = arg;
    } else if (!arg.startsWith("--") && opts.preset && !opts.prompt) {
      opts.prompt = arg;
    }
    i++;
  }
  return opts;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  // --list
  if (opts.list) {
    const presets = await listPresets();
    console.log(`\n${BOLD}Available agent presets:${RESET}\n`);
    for (const p of presets) {
      const tag = p.online ? ` ${YELLOW}[online]${RESET}` : "";
      console.log(`  ${CYAN}${p.name.padEnd(16)}${RESET}${p.description}${tag}`);
      console.log(`  ${DIM}${"".padEnd(16)}model: ${p.model}  tools: ${p.tools.join(", ")}${RESET}`);
      console.log();
    }
    return;
  }

  // Must have a preset
  if (!opts.preset) {
    printHelp();
    process.exit(1);
  }

  // Load preset
  let config;
  try {
    config = await loadPreset(opts.preset);
  } catch {
    console.error(`${RED}Unknown preset: ${opts.preset}${RESET}`);
    console.error(`Run ${CYAN}localagent --list${RESET} to see available presets.`);
    process.exit(1);
  }

  // Apply overrides
  if (opts.model) config.model = opts.model;
  if (opts.turns) config.max_turns = opts.turns;

  const prompt = opts.prompt || config.default_prompt;
  const cwd = opts.cwd || process.env.AGENT_CWD || process.cwd();

  // Banner
  console.log(`\n${BOLD}${CYAN}▶ ${config.name}${RESET} ${DIM}(${config.model})${RESET}`);
  console.log(`${DIM}  cwd: ${cwd}${RESET}`);
  console.log(`${DIM}  prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}${RESET}\n`);

  // Run
  try {
    const result = await runAgent(config, prompt, {
      cwd,
      onTurn(turn) {
        if (turn > 0) console.log();
      },
      onToolCall(name, args) {
        const argStr =
          typeof args === "string" ? args : JSON.stringify(args);
        console.log(
          `  ${GREEN}⚙ ${name}${RESET} ${DIM}${argStr.slice(0, 120)}${RESET}`
        );
      },
      onToolResult(name, result) {
        const lines = result.split("\n").length;
        const preview = result.slice(0, 100).replace(/\n/g, " ");
        console.log(
          `  ${DIM}  ↳ ${lines} line${lines !== 1 ? "s" : ""}: ${preview}${result.length > 100 ? "..." : ""}${RESET}`
        );
      },
    });

    // Final output
    console.log(`\n${"─".repeat(60)}`);
    console.log(result.response);
    console.log(`${"─".repeat(60)}`);

    if (result.truncated) {
      console.log(`\n${YELLOW}⚠ Agent hit the turn limit (${config.max_turns}). Response may be incomplete.${RESET}`);
    }

    console.log(
      `\n${DIM}Turns: ${result.turns} | Tools used: ${result.tools_used.join(", ") || "none"}${RESET}\n`
    );
  } catch (err) {
    console.error(`\n${RED}Error: ${err.message}${RESET}`);
    process.exit(1);
  }
}

main();

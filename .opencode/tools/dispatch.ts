import { tool } from "@opencode-ai/plugin/tool";

export const dispatch_agent = tool({
  description:
    "Run a localagent preset and return its output. Available presets: git-commit, doc-processor, job-scanner, coder. The agent runs a full tool-calling loop against Ollama and returns the final result.",
  args: {
    agent: tool.schema
      .string()
      .describe("Preset name: git-commit, doc-processor, job-scanner, coder"),
    prompt: tool.schema.string().describe("Task or question for the agent"),
    model: tool.schema
      .string()
      .optional()
      .describe("Override model (default: preset's model)"),
  },
  async execute(args, ctx) {
    const { execFileSync } = await import("child_process");
    // Allowlist of valid preset names — rejects anything unexpected so a
    // compromised agent can't smuggle --flags or paths into argv[2].
    const ALLOWED = new Set([
      "coder",
      "doc-processor",
      "job-scanner",
      "git-commit",
      "telegram-assistant",
    ]);
    if (!ALLOWED.has(args.agent)) {
      return `Unknown preset: ${args.agent}. Allowed: ${[...ALLOWED].join(", ")}`;
    }
    // execFileSync bypasses the shell, so prompt/model can contain any
    // shell metacharacter without injection risk.
    const cliArgs = [args.agent];
    if (args.model) cliArgs.push("--model", args.model);
    cliArgs.push(args.prompt);
    try {
      return execFileSync("node", ["/workspace/localagent/cli.mjs", ...cliArgs], {
        encoding: "utf8",
        cwd: ctx.directory,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          OLLAMA_HOST: process.env.OLLAMA_HOST || "http://ollama:11434",
        },
      });
    } catch (e: any) {
      return `Agent error: ${e.stderr || e.message}`;
    }
  },
});

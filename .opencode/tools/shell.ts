import { tool } from "@opencode-ai/plugin/tool";

export const run_command = tool({
  description:
    "Execute a shell command and return its output. 30-second timeout. Use for builds, tests, git, npm, etc.",
  args: {
    command: tool.schema.string().describe("Shell command to execute"),
  },
  async execute(args, ctx) {
    const { execSync } = await import("child_process");
    try {
      return execSync(args.command, {
        encoding: "utf8",
        cwd: ctx.directory,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
    } catch (e: any) {
      return `Exit code ${e.status}\nstdout: ${e.stdout || ""}\nstderr: ${e.stderr || ""}`;
    }
  },
});

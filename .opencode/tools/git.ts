import { tool } from "@opencode-ai/plugin/tool";

export const git_status = tool({
  description: "Show current git status: staged, unstaged, and untracked files.",
  args: {},
  async execute(_args, ctx) {
    const { execSync } = await import("child_process");
    try {
      return execSync("git status", { encoding: "utf8", cwd: ctx.directory });
    } catch (e: any) {
      return `git error: ${e.stderr || e.message}`;
    }
  },
});

export const git_diff = tool({
  description:
    "Show git diff. By default shows all changes (staged + unstaged).",
  args: {
    staged: tool.schema
      .boolean()
      .optional()
      .describe("If true, show only staged changes"),
  },
  async execute(args, ctx) {
    const { execSync } = await import("child_process");
    const cmd = args.staged ? "git diff --cached" : "git diff HEAD";
    try {
      const out = execSync(cmd, {
        encoding: "utf8",
        cwd: ctx.directory,
        maxBuffer: 1024 * 1024,
      });
      return out || "No changes.";
    } catch {
      try {
        return (
          execSync("git diff", {
            encoding: "utf8",
            cwd: ctx.directory,
            maxBuffer: 1024 * 1024,
          }) || "No changes."
        );
      } catch {
        return "No git changes or not a git repository.";
      }
    }
  },
});

export const git_log = tool({
  description: "Show recent git commit log (oneline format).",
  args: {
    count: tool.schema
      .number()
      .optional()
      .describe("Number of commits to show (default: 10)"),
  },
  async execute(args, ctx) {
    const { execSync } = await import("child_process");
    const n = args.count || 10;
    try {
      return execSync(`git log --oneline -${n}`, {
        encoding: "utf8",
        cwd: ctx.directory,
      });
    } catch {
      return "No commits yet or not a git repository.";
    }
  },
});

import { tool } from "@opencode-ai/plugin/tool";

export const read_file = tool({
  description:
    "Read the contents of a file. Always use this before modifying a file.",
  args: {
    path: tool.schema
      .string()
      .describe("File path (absolute or relative to project directory)"),
  },
  async execute(args, ctx) {
    const fs = await import("fs/promises");
    const { resolve } = await import("path");
    const abs = resolve(ctx.directory, args.path);
    return await fs.readFile(abs, "utf8");
  },
});

export const write_file = tool({
  description:
    "Write content to a file. Creates parent directories if needed.",
  args: {
    path: tool.schema.string().describe("File path to write to"),
    content: tool.schema.string().describe("Full file content"),
  },
  async execute(args, ctx) {
    const fs = await import("fs/promises");
    const { resolve, dirname } = await import("path");
    const abs = resolve(ctx.directory, args.path);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, args.content, "utf8");
    return `Written ${args.content.length} bytes to ${args.path}`;
  },
});

export const list_directory = tool({
  description:
    "List files and subdirectories. Directories are suffixed with /.",
  args: {
    path: tool.schema
      .string()
      .optional()
      .describe("Directory to list (default: project root)"),
  },
  async execute(args, ctx) {
    const fs = await import("fs/promises");
    const { resolve } = await import("path");
    const abs = resolve(ctx.directory, args.path || ".");
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join("\n");
  },
});

export const search_files = tool({
  description:
    "Search file contents for a pattern. Returns matching lines with paths and line numbers.",
  args: {
    pattern: tool.schema.string().describe("Text or regex to search for"),
    path: tool.schema
      .string()
      .optional()
      .describe("Directory to search (default: project root)"),
    glob: tool.schema
      .string()
      .optional()
      .describe('File glob filter (e.g. "*.js")'),
  },
  async execute(args, ctx) {
    const { execFileSync } = await import("child_process");
    const { resolve } = await import("path");
    const abs = resolve(ctx.directory, args.path || ".");
    // execFileSync bypasses the shell — `pattern` and `glob` are passed
    // as argv entries, so shell metacharacters ($, `, ;, |, etc.) in user
    // input can NOT inject commands. Do NOT collapse this back to a
    // string-interpolated execSync.
    const grepArgs = ["-rn", "--", args.pattern, abs];
    if (args.glob) grepArgs.splice(1, 0, `--include=${args.glob}`);
    try {
      const out = execFileSync("grep", grepArgs, {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      return out.split("\n").slice(0, 50).join("\n");
    } catch (e: any) {
      if (e.status === 1) return "No matches found.";
      return `grep error: ${e.stderr || e.message}`;
    }
  },
});

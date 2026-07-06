// localagent/tools.mjs — Tool definitions and implementations for the agent runner.
// Each tool has a JSON Schema definition (sent to Ollama) and an execute function.
// No external dependencies — uses only Node built-ins.

import { readFile, writeFile, readdir, mkdir, realpath } from "fs/promises";
import { execSync } from "child_process";
import { resolve, dirname, isAbsolute, sep } from "path";
import { existsSync } from "fs";

// ── Tool Definitions (JSON Schema for Ollama's tool-calling API) ──────

export const toolDefinitions = {
  read_file: {
    name: "read_file",
    description:
      "Read the contents of a file. Returns the full text. Use this before modifying any file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path (absolute or relative to working directory)",
        },
      },
      required: ["path"],
    },
  },

  write_file: {
    name: "write_file",
    description:
      "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path to write to",
        },
        content: {
          type: "string",
          description: "Full file content to write",
        },
      },
      required: ["path", "content"],
    },
  },

  sandboxed_write_file: {
    name: "sandboxed_write_file",
    description:
      "Write content to a file. SANDBOXED: path must be relative, contain no '..' segments, and resolve under 'inbox/' or 'reports/' within the working directory. Use when a preset must not be able to modify source or config.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path under inbox/ or reports/",
        },
        content: {
          type: "string",
          description: "Full file content to write",
        },
      },
      required: ["path", "content"],
    },
  },

  list_directory: {
    name: "list_directory",
    description:
      "List files and subdirectories at a path. Directories end with /. Defaults to the current working directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path to list (default: current working directory)",
        },
      },
      required: [],
    },
  },

  search_files: {
    name: "search_files",
    description:
      "Search file contents for a text pattern. Returns matching lines with file paths and line numbers. Limited to 50 results.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text or regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: current directory)",
        },
        glob: {
          type: "string",
          description: 'File glob filter (e.g. "*.js", "*.md")',
        },
      },
      required: ["pattern"],
    },
  },

  run_command: {
    name: "run_command",
    description:
      "Execute a shell command and return stdout+stderr. 30-second timeout. Use for builds, tests, installs, etc.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute",
        },
      },
      required: ["command"],
    },
  },

  git_status: {
    name: "git_status",
    description:
      "Show current git status: staged, unstaged, and untracked files.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  git_diff: {
    name: "git_diff",
    description:
      "Show the current git diff. By default shows all changes (staged + unstaged).",
    parameters: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "If true, show only staged (cached) changes",
        },
      },
      required: [],
    },
  },

  git_log: {
    name: "git_log",
    description: "Show recent git commit history (oneline format).",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of commits to show (default: 10)",
        },
      },
      required: [],
    },
  },

  web_fetch: {
    name: "web_fetch",
    description:
      "Fetch content from a URL via HTTP. Returns status code and response body (truncated to 10 KB). Requires internet.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch",
        },
        method: {
          type: "string",
          description: "HTTP method (default: GET)",
        },
        headers: {
          type: "object",
          description: "Request headers as key-value pairs",
        },
        body: {
          type: "string",
          description: "Request body (for POST/PUT)",
        },
      },
      required: ["url"],
    },
  },
};

// ── Tool Implementations ──────────────────────────────────────────────

const implementations = {
  async read_file({ path: filePath }, { cwd }) {
    const abs = resolve(cwd, filePath);
    return await readFile(abs, "utf8");
  },

  async write_file({ path: filePath, content }, { cwd }) {
    const abs = resolve(cwd, filePath);
    const dir = dirname(abs);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(abs, content, "utf8");
    return `Written ${content.length} bytes to ${filePath}`;
  },

  async sandboxed_write_file({ path: filePath, content }, { cwd }) {
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error("sandboxed_write_file: path required");
    }
    if (isAbsolute(filePath)) {
      throw new Error(
        `sandboxed_write_file: absolute paths rejected (got: ${filePath})`
      );
    }
    if (filePath.split(/[\\/]+/).includes("..")) {
      throw new Error(
        `sandboxed_write_file: '..' segments rejected (got: ${filePath})`
      );
    }
    const allowedRoots = ["inbox", "reports"].map((d) => resolve(cwd, d));
    const abs = resolve(cwd, filePath);
    const underAllowed = (p) =>
      allowedRoots.some((r) => p === r || p.startsWith(r + sep));
    if (!underAllowed(abs)) {
      throw new Error(
        `sandboxed_write_file: path outside inbox/ and reports/ (resolved: ${abs})`
      );
    }
    for (const r of allowedRoots) {
      if (!existsSync(r)) await mkdir(r, { recursive: true });
    }
    let ancestor = dirname(abs);
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    const realAncestor = await realpath(ancestor);
    const realRoots = await Promise.all(
      allowedRoots.map((r) => realpath(r))
    );
    const realUnderAllowed = realRoots.some(
      (r) => realAncestor === r || realAncestor.startsWith(r + sep)
    );
    if (!realUnderAllowed) {
      throw new Error(
        `sandboxed_write_file: symlink escape (real ancestor: ${realAncestor})`
      );
    }
    const dir = dirname(abs);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(abs, content, "utf8");
    return `Written ${content.length} bytes to ${filePath}`;
  },

  async list_directory({ path: dirPath = "." }, { cwd }) {
    const abs = resolve(cwd, dirPath);
    const entries = await readdir(abs, { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n");
  },

  async search_files({ pattern, path: searchPath = ".", glob: fileGlob }, { cwd }) {
    const abs = resolve(cwd, searchPath);
    const escaped = pattern.replace(/"/g, '\\"');
    let cmd = `grep -rn "${escaped}" "${abs}"`;
    if (fileGlob) cmd += ` --include="${fileGlob}"`;
    cmd += " 2>/dev/null | head -50";
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 15000 });
    } catch (e) {
      if (e.status === 1) return "No matches found.";
      throw e;
    }
  },

  async run_command({ command }, { cwd }) {
    try {
      return execSync(command, {
        encoding: "utf8",
        cwd,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
    } catch (e) {
      return `Exit code ${e.status}\nstdout: ${e.stdout || ""}\nstderr: ${e.stderr || ""}`;
    }
  },

  async git_status(_, { cwd }) {
    try {
      return execSync("git status", { encoding: "utf8", cwd });
    } catch (e) {
      return `git error: ${e.stderr || e.message}`;
    }
  },

  async git_diff({ staged } = {}, { cwd }) {
    const cmd = staged ? "git diff --cached" : "git diff HEAD";
    try {
      const out = execSync(cmd, { encoding: "utf8", cwd, maxBuffer: 1024 * 1024 });
      return out || "No changes.";
    } catch {
      // HEAD might not exist in a fresh repo
      try {
        return execSync("git diff", { encoding: "utf8", cwd, maxBuffer: 1024 * 1024 }) || "No changes.";
      } catch {
        return "No git changes or not a git repository.";
      }
    }
  },

  async git_log({ count = 10 } = {}, { cwd }) {
    try {
      return execSync(`git log --oneline -${count}`, { encoding: "utf8", cwd });
    } catch {
      return "No commits yet or not a git repository.";
    }
  },

  async web_fetch({ url, method = "GET", headers = {}, body: reqBody }, _ctx) {
    const opts = { method, headers: { ...headers } };
    if (reqBody) opts.body = reqBody;
    const response = await fetch(url, opts);
    const text = await response.text();
    return `Status: ${response.status}\n\n${text.slice(0, 10240)}`;
  },
};

// ── Public API ────────────────────────────────────────────────────────

/**
 * Execute a tool by name. Arguments may be a parsed object or a JSON string
 * (some models return stringified args).
 */
export async function executeTool(name, rawArgs, context) {
  const impl = implementations[name];
  if (!impl) throw new Error(`Unknown tool: ${name}`);

  let args = rawArgs || {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }

  return impl(args, context);
}

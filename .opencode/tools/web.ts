import { tool } from "@opencode-ai/plugin/tool";

export const web_fetch = tool({
  description:
    "Fetch content from a URL via HTTP. Returns status and body (max 10 KB). Requires internet connection.",
  args: {
    url: tool.schema.string().describe("URL to fetch"),
    method: tool.schema
      .string()
      .optional()
      .describe("HTTP method (default: GET)"),
  },
  async execute(args) {
    const opts: RequestInit = { method: args.method || "GET" };
    const response = await fetch(args.url, opts);
    const text = await response.text();
    return `Status: ${response.status}\n\n${text.slice(0, 10240)}`;
  },
});

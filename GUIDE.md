# LocalAgent Guide

Your local AI agents -- no cloud, no API keys, no accounts.

LocalAgent is a system that runs AI agents entirely on your machine through
Ollama. Agents can read and write files, run shell commands, inspect git
history, and fetch web pages. You interact with them two ways: terminal
commands (the CLI) or HTTP requests (the API). Everything is already
installed inside the Docker build.


---------------------------------------------------------------------
## How It Works
---------------------------------------------------------------------

Three services run when you start the stack:

```
  You (terminal or script)
    |
    |--- CLI command ------\
    |                       \
    |--- curl / HTTP ------> Agent API (port 3777)
                                |
                                |  sends prompt + tool definitions
                                v
                            Ollama (port 11434)
                                |
                                |  model thinks, calls tools
                                v
                            Tool execution
                            (read files, run commands, etc.)
                                |
                                |  results fed back to model
                                v
                            Final response returned to you
```

**Ollama** is the inference engine. It loads a model into memory and
generates text. It listens on port 11434.

**Agent API** is the dispatcher. It receives your request, loads the
right agent configuration, sends it to Ollama, handles tool calls in
a loop, and returns the final result. It listens on port 3777.

**Models** are pre-loaded on first startup: Gemma 4 E4B (8B parameters,
general-purpose) and GRM-2.5 (4B parameters, reasoning-optimized).

### Turns and Tools

An agent works in a loop called "turns." Each turn, the model either
calls a tool (read a file, run a command, etc.) or produces its final
answer. The loop continues until the model has enough information to
respond, or it hits a turn limit.

### Offline vs Online

Every agent except `job-scanner` works with zero internet connection.
Once the models are downloaded, you can disconnect entirely. The
`job-scanner` preset uses `web_fetch` to reach external URLs -- it is
the only preset that needs internet.


---------------------------------------------------------------------
## Before You Start
---------------------------------------------------------------------

1. **Docker is running.** Open a terminal and run `docker ps`. If you
   see a table (even an empty one), Docker is ready. If you get an
   error, start Docker Desktop first.

2. **The stack is up.** From the Local LLM Toolbox folder, run:

       docker compose up -d

   For first-time setup, GPU configuration, and WSL memory tuning,
   see [SETUP.txt](SETUP.txt).

3. **Models are loaded.** On the first startup, models are downloaded
   automatically. Check progress with:

       docker compose logs ollama-init

   Wait until you see `Model check complete.` before using agents.


---------------------------------------------------------------------
## Quick Start
---------------------------------------------------------------------

Copy and paste these commands to see agents in action immediately.

**1. Ask what files are in the project:**

```
docker compose exec agent-api node /workspace/localagent/cli.mjs doc-processor "What files are in this project?"
```

The doc-processor agent lists the directory, reads documentation files,
and summarizes what it finds.

**2. Ask the coder agent to explain a file:**

```
docker compose exec agent-api node /workspace/localagent/cli.mjs coder "Explain the Dockerfile"
```

The coder agent reads the Dockerfile and explains each section.

**3. Hit the API with curl:**

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"doc-processor\",\"prompt\":\"Summarize README.md\"}"
```

Returns a JSON response with the agent's output.


---------------------------------------------------------------------
## CLI Usage
---------------------------------------------------------------------

### Running an Agent

The basic pattern from inside Docker:

```
docker compose exec agent-api node /workspace/localagent/cli.mjs <preset> [prompt]
```

- `<preset>` is required -- the agent name (e.g., `git-commit`, `coder`).
- `[prompt]` is optional -- what you want the agent to do. If omitted,
  each preset has a sensible default.

If you have Ollama installed directly on your machine (not just in
Docker), you can run the CLI natively from the Local LLM Toolbox folder:

```
node localagent/cli.mjs <preset> [prompt]
```

### CLI Flags

| Flag             | Description                                          |
|------------------|------------------------------------------------------|
| `--list` / `-l`  | List all available agent presets                     |
| `--help` / `-h`  | Show full help text                                  |
| `--model <name>` | Use a different model (e.g., `--model grm-2.5`)  |
| `--cwd <path>`   | Set the working directory agents operate in          |
| `--turns <n>`    | Override the maximum number of turns                 |

### Reading the Output

When you run an agent, the terminal shows three sections:

1. **Banner** -- the agent name, model, working directory, and your
   prompt. Appears at the top.

2. **Tool trace** -- each tool call is shown as it happens:
   ```
     ⚙ git_status {}
       ↳ 12 lines: On branch main Your branch is up to date...
   ```
   You can see exactly what the agent is doing and reading.

3. **Final response** -- the agent's answer, printed between horizontal
   rules. Below it, a summary shows how many turns were used and which
   tools were called.

If you see a warning that the agent hit the turn limit, increase it:

```
docker compose exec agent-api node /workspace/localagent/cli.mjs coder --turns 40 "Refactor utils.js"
```

### Environment Variables

| Variable      | Default                    | Description                    |
|---------------|----------------------------|--------------------------------|
| `OLLAMA_HOST` | `http://localhost:11434`   | Ollama API URL                 |
| `AGENT_CWD`   | current directory          | Default working directory      |

Inside Docker, `OLLAMA_HOST` is set automatically to
`http://ollama:11434`. You only need to change it if running natively
with a non-standard Ollama setup.


---------------------------------------------------------------------
## HTTP API
---------------------------------------------------------------------

The Agent API runs on port 3777 and accepts JSON requests. Use it
from scripts, automation pipelines, other tools, or any language that
can make HTTP calls.

### GET /health

Check that the service is running.

```
curl http://localhost:3777/health
```

Response:

```json
{
  "status": "ok",
  "service": "localagent",
  "ollama": "http://ollama:11434"
}
```

### GET /api/agents

List all available agent presets.

```
curl http://localhost:3777/api/agents
```

Response: an array of objects with `name`, `description`, `model`,
`online` (boolean), and `tools` (array of tool names).

### GET /api/models

List all models available in Ollama.

```
curl http://localhost:3777/api/models
```

This proxies through to Ollama's model list. Useful for checking what
models are downloaded before running an agent.

### POST /api/run

Run an agent and return the result. This is the main endpoint.

**Minimal request** (preset with default prompt):

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"git-commit\"}"
```

**Full request** (all options):

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{
    \"agent\": \"coder\",
    \"prompt\": \"Add input validation to server.mjs\",
    \"model\": \"grm-2.5\",
    \"cwd\": \"/workspace/projects/myapp\",
    \"max_turns\": 20
  }"
```

**Custom agent** (no preset, define inline):

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{
    \"system\": \"You are a Python code reviewer. Read files and provide feedback.\",
    \"tools\": [\"read_file\", \"list_directory\", \"search_files\"],
    \"prompt\": \"Review the Python files in this project\",
    \"model\": \"gemma4:e4b\",
    \"max_turns\": 10
  }"
```

**Response shape:**

```json
{
  "agent": "coder",
  "model": "gemma4:e4b",
  "response": "The agent's final text response...",
  "turns": 5,
  "tools_used": ["read_file", "list_directory"],
  "truncated": false,
  "elapsed_ms": 12400
}
```

| Field        | Type    | Description                                      |
|--------------|---------|--------------------------------------------------|
| `agent`      | string  | Preset name (or "custom")                        |
| `model`      | string  | Model that was used                              |
| `response`   | string  | The agent's final answer                         |
| `turns`      | number  | How many turns the agent took                    |
| `tools_used` | array   | Which tools were called (deduplicated)           |
| `truncated`  | boolean | True if the agent hit the turn limit             |
| `elapsed_ms` | number  | Total wall time in milliseconds                  |

### API Reference

| Method | Endpoint      | Body                            | Description              |
|--------|---------------|---------------------------------|--------------------------|
| GET    | /health       | --                              | Health check             |
| GET    | /api/agents   | --                              | List agent presets       |
| GET    | /api/models   | --                              | List Ollama models       |
| POST   | /api/run      | `{agent, prompt, model?, ...}`  | Run an agent             |

### API Environment Variables

| Variable      | Default                    | Description                     |
|---------------|----------------------------|---------------------------------|
| `OLLAMA_HOST` | `http://localhost:11434`   | Ollama API URL                  |
| `AGENT_PORT`  | `3777`                     | Port the API listens on         |
| `AGENT_HOST`  | `0.0.0.0`                 | Bind address                    |
| `AGENT_CWD`   | `/workspace/projects`      | Default working directory       |


---------------------------------------------------------------------
## Agent Presets
---------------------------------------------------------------------

Five agents ship in the box. Four are intended for interactive use
(CLI, API, or OpenCode). `telegram-assistant` is the sandboxed preset
used by the optional Telegram bridge — you can call it directly for
testing, but its tool surface is deliberately narrower.

| Preset               | Tools | Max Turns | Online? | Best For                       |
|----------------------|-------|-----------|---------|--------------------------------|
| `git-commit`         | 3     | 5         | No      | Generating commit messages     |
| `doc-processor`      | 4     | 15        | No      | Summarizing and analyzing docs |
| `job-scanner`        | 4     | 15        | Yes     | Analyzing job listings         |
| `coder`              | 8     | 25        | No      | General coding tasks           |
| `telegram-assistant` | 4     | 8         | No      | Sandboxed messaging (bridge)   |


### git-commit

Reads your git status, diff, and recent commit log, then generates a
conventional commit message (`type(scope): description`).

**Tools:** git_status, git_diff, git_log
**Turns:** 5 | **Online:** No

```
docker compose exec agent-api node /workspace/localagent/cli.mjs git-commit
```

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"git-commit\"}"
```

**Tip:** Run this from a git repository with staged or unstaged changes.
The agent looks at your recent commit messages to match your style.


### doc-processor

Reads files in the working directory. Can summarize, extract key
information, compare documents, or restructure content. Writes output
to a file if you ask it to.

**Tools:** read_file, write_file, list_directory, search_files
**Turns:** 15 | **Online:** No

```
docker compose exec agent-api node /workspace/localagent/cli.mjs doc-processor "Summarize all markdown files"
```

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"doc-processor\",\"prompt\":\"Extract all URLs from the documentation\"}"
```

**Tip:** Use `--cwd` to point the agent at the specific folder
containing the documents you want processed.


### job-scanner

Fetches job listing pages from URLs you provide, extracts job details
(title, company, requirements, salary), scores them against your
criteria, and writes a ranked report.

**Tools:** web_fetch, read_file, write_file, list_directory
**Turns:** 15 | **Online:** Yes -- requires internet

```
docker compose exec agent-api node /workspace/localagent/cli.mjs job-scanner "Check these listings: https://example.com/jobs"
```

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"job-scanner\",\"prompt\":\"Analyze jobs at https://example.com/jobs\"}"
```

**Criteria file:** If you place a `criteria.md` file in the working
directory, the agent reads it automatically. Include your skills,
preferred locations, salary range, and role preferences. Example:

```markdown
# Job Search Criteria
- Role: Software Engineer, Full-stack Developer
- Skills: JavaScript, Python, Docker, Kubernetes
- Location: Remote or Seattle area
- Salary: $120k+ base
- Prefer: Startups, open-source friendly companies
```

The agent will score each listing against these criteria.

**Note:** This is the only preset that reaches the internet. All
fetched data is processed locally -- nothing is sent to a cloud API.


### coder

General-purpose coding assistant with access to all offline tools.
Can read and write files, search codebases, run shell commands, and
use git. This is the closest equivalent to a cloud-based coding CLI,
running entirely on your machine.

**Tools:** read_file, write_file, list_directory, search_files,
run_command, git_status, git_diff, git_log
**Turns:** 25 | **Online:** No

```
docker compose exec agent-api node /workspace/localagent/cli.mjs coder "Add error handling to server.mjs"
```

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"coder\",\"prompt\":\"Find all TODO comments and list them\"}"
```

**Tip:** Give specific tasks rather than vague requests. "Add input
validation to the /login endpoint in routes.js" works better than
"improve the code."


### telegram-assistant

Sandboxed preset for unattended messaging bridges. Same base model as
the others but `run_command` and `web_fetch` are stripped, and
`write_file` is replaced with `sandboxed_write_file`, which only
accepts paths under `inbox/` or `reports/` (absolute paths and `..`
are rejected at the tool layer, not just by the system prompt).

This is the preset the Telegram bridge is hardcoded to dispatch — the
bridge cannot pick any other agent, which is the single most
important piece of the messaging safety story. You rarely need to
call it directly; it's listed here for completeness.

**Model:** `gemma4:e4b-chat` (short-context 4K variant, faster on warm
inference) — see "Models" below.
**Tools:** read_file, list_directory, search_files, sandboxed_write_file
**Turns:** 8 | **Online:** No

```
docker compose exec agent-api node /workspace/localagent/cli.mjs telegram-assistant "Summarize anything in inbox/"
```

See `telegram-bridge/README.md` for the full security contract and the
SECURITY section of SETUP.txt for what not to do with this setup.


---------------------------------------------------------------------
## Tools Reference
---------------------------------------------------------------------

Agents call tools to interact with the system. Each preset has access
to a subset of the 9 available tools.

### Filesystem

| Tool             | What It Does                                        | Key Parameters         |
|------------------|-----------------------------------------------------|------------------------|
| `read_file`      | Read a file's contents                              | `path`                 |
| `write_file`     | Write content to a file (creates dirs if needed)    | `path`, `content`      |
| `list_directory` | List files and subdirectories                       | `path` (optional)      |
| `search_files`   | Search file contents with text/regex patterns       | `pattern`, `path`, `glob` |

### Shell

| Tool             | What It Does                                        | Key Parameters         |
|------------------|-----------------------------------------------------|------------------------|
| `run_command`    | Execute a shell command (30s timeout, 1 MB buffer)  | `command`              |

### Git

| Tool             | What It Does                                        | Key Parameters         |
|------------------|-----------------------------------------------------|------------------------|
| `git_status`     | Show staged, unstaged, and untracked files          | (none)                 |
| `git_diff`       | Show current changes (all or staged only)           | `staged` (optional)    |
| `git_log`        | Show recent commit history (oneline format)         | `count` (optional)     |

### Network

| Tool             | What It Does                                        | Key Parameters         |
|------------------|-----------------------------------------------------|------------------------|
| `web_fetch`      | Fetch a URL via HTTP (response truncated to 10 KB)  | `url`, `method`        |

**Security note:** Inside Docker, agents are sandboxed. They can only
read and write files in `/workspace/projects` (the mounted volume from
your `projects/` folder). They cannot access files outside the
container.


---------------------------------------------------------------------
## Creating Custom Presets
---------------------------------------------------------------------

Presets are JSON files in `localagent/presets/`. To create a new one,
add a `.json` file with this structure:

```json
{
  "name": "code-reviewer",
  "description": "Reviews code and provides feedback on quality and bugs",
  "model": "gemma4:e4b",
  "system": "You are a code reviewer. Read the files the user points you to and provide constructive feedback on code quality, potential bugs, and improvements. Always read files before commenting on them. Be specific -- reference line numbers and function names.",
  "tools": ["read_file", "list_directory", "search_files", "git_diff"],
  "max_turns": 15,
  "default_prompt": "Review the recent changes in this project.",
  "online": false
}
```

### Fields

| Field            | Required | Description                                          |
|------------------|----------|------------------------------------------------------|
| `name`           | Yes      | Preset identifier (used in CLI and API)              |
| `description`    | Yes      | One-line summary (shown in `--list`)                 |
| `model`          | Yes      | Ollama model to use (e.g., `gemma4:e4b`)             |
| `system`         | Yes      | System prompt -- the agent's instructions            |
| `tools`          | Yes      | Array of tool names the agent can call               |
| `max_turns`      | Yes      | Maximum number of tool-call loops                    |
| `default_prompt` | Yes      | Used when no prompt is provided                      |
| `online`         | Yes      | `true` if the agent needs internet (for display)     |

### Tips for System Prompts

The system prompt is the most important part. It defines the agent's
behavior. Write it as direct instructions:

- Tell the agent what tools to call and in what order
- Set rules ("always read files before modifying them")
- Define the output format ("output only the commit message, no commentary")
- Keep it focused -- smaller models work better with clear, specific instructions

### Testing Your Preset

After saving the file, it is immediately available:

```
docker compose exec agent-api node /workspace/localagent/cli.mjs --list
docker compose exec agent-api node /workspace/localagent/cli.mjs code-reviewer "Review server.mjs"
```

### One-Off Custom Agents (API Only)

You can also run a custom agent without creating a file. POST to
`/api/run` with `system` and `tools` instead of `agent`:

```
curl -X POST http://localhost:3777/api/run \
  -H "Content-Type: application/json" \
  -d "{
    \"system\": \"You summarize CSV data into bullet points.\",
    \"tools\": [\"read_file\", \"list_directory\"],
    \"prompt\": \"Summarize data.csv\",
    \"max_turns\": 5
  }"
```


---------------------------------------------------------------------
## Adding Models
---------------------------------------------------------------------

### Pull a New Model

While the stack is running:

```
docker compose exec ollama ollama pull mistral
```

Browse available models at: https://ollama.com/library

### Use a Different Model

**CLI:** Add `--model` to any command:

```
docker compose exec agent-api node /workspace/localagent/cli.mjs coder --model grm-2.5 "List the files"
```

**API:** Add `"model"` to the request body:

```json
{"agent": "coder", "prompt": "List the files", "model": "grm-2.5"}
```

**Preset default:** Edit the `"model"` field in a preset JSON file.

### List Installed Models

```
docker compose exec ollama ollama list
```

Or via the API:

```
curl http://localhost:3777/api/models
```

### Model Size Tradeoffs

Smaller models (1-4B parameters) respond faster but produce simpler
output. Larger models (7B+) are more capable but need more RAM and
take longer per turn. The default, Gemma 4 E4B (8B), is a good
balance of speed and quality for tool-calling tasks.

If you add larger models, you may need to increase the WSL memory cap
on Windows. See [SETUP.txt](SETUP.txt) for instructions.


---------------------------------------------------------------------
## Working with Projects
---------------------------------------------------------------------

The `projects/` folder on your host machine is mounted inside the
Docker container at `/workspace/projects`. This is the default working
directory for agents run through the API.

**To work on your own code:**

1. Copy or clone your project into the `projects/` folder
2. Run an agent with `--cwd` pointing at it:

```
docker compose exec agent-api node /workspace/localagent/cli.mjs coder --cwd /workspace/projects/myapp "Add tests for the login function"
```

Or via the API:

```json
{"agent": "coder", "prompt": "Add tests", "cwd": "/workspace/projects/myapp"}
```

Files the agent creates or modifies will appear in your `projects/`
folder on the host, since the directory is shared.


---------------------------------------------------------------------
## Troubleshooting
---------------------------------------------------------------------

For Docker installation, GPU setup, and WSL memory issues, see
[SETUP.txt](SETUP.txt). The following covers agent-specific problems.


### "Cannot reach Ollama" error

The agent cannot connect to Ollama. Check that it is running:

    docker compose ps

The `ollama` service must show as "running" and "healthy." If it is
not running, start the stack:

    docker compose up -d


### Agent returns empty or nonsensical output

The model may be too small for the task. Try a larger model:

    --model grm-2.5

Also check that your prompt is specific. "Fix the code" is vague.
"Fix the TypeError on line 42 of server.mjs" gives the agent
something concrete to work with.


### "Unknown preset" error

The preset name was not found. Check spelling and run:

    docker compose exec agent-api node /workspace/localagent/cli.mjs --list

This shows all available presets.


### Agent hit the turn limit

The agent ran out of turns before finishing. Increase the limit:

    --turns 40

Or in the API: `"max_turns": 40`. The agent was mid-task when it
stopped -- a higher limit lets it continue.


### web_fetch fails (job-scanner)

The container needs internet access. Docker Desktop on Windows and
Mac provides internet to containers by default. If it fails, check
Docker's network settings and that your host has connectivity.


### API returns 404

You hit a wrong URL or HTTP method. The available endpoints are:

    GET  /health
    GET  /api/agents
    GET  /api/models
    POST /api/run

Check for typos. Note that `/api/run` requires POST, not GET.


### Port 3777 is not accessible

Check that the agent-api container is running:

    docker compose ps

If it shows as running but the port is still blocked, check your
firewall settings. On Windows, you may need to allow port 3777
through Windows Defender Firewall.


---------------------------------------------------------------------
## Quick Reference
---------------------------------------------------------------------

### CLI Commands

```
# List available agents
docker compose exec agent-api node /workspace/localagent/cli.mjs --list

# Run an agent with default prompt
docker compose exec agent-api node /workspace/localagent/cli.mjs git-commit

# Run an agent with a custom prompt
docker compose exec agent-api node /workspace/localagent/cli.mjs coder "Explain server.mjs"

# Override the model
docker compose exec agent-api node /workspace/localagent/cli.mjs coder --model grm-2.5 "List files"

# Override the working directory
docker compose exec agent-api node /workspace/localagent/cli.mjs coder --cwd /workspace/projects/myapp "Run the tests"

# Increase the turn limit
docker compose exec agent-api node /workspace/localagent/cli.mjs coder --turns 40 "Refactor utils.js"

# Native (if Ollama is installed on host)
node localagent/cli.mjs coder "Explain the Dockerfile"
```

### API Endpoints

| Method | Endpoint      | Description             | Example Body                                          |
|--------|---------------|-------------------------|-------------------------------------------------------|
| GET    | /health       | Health check            | --                                                    |
| GET    | /api/agents   | List agent presets      | --                                                    |
| GET    | /api/models   | List Ollama models      | --                                                    |
| POST   | /api/run      | Run an agent            | `{"agent":"coder","prompt":"Explain server.mjs"}`     |

### Presets

| Name             | Model       | Tools | Turns | Online | Purpose                      |
|------------------|-------------|-------|-------|--------|------------------------------|
| `git-commit`     | gemma4:e4b  | 3     | 5     | No     | Generate commit messages     |
| `doc-processor`  | gemma4:e4b  | 4     | 15    | No     | Analyze documents            |
| `job-scanner`    | gemma4:e4b  | 4     | 15    | Yes    | Analyze job listings         |
| `coder`          | gemma4:e4b  | 8     | 25    | No     | General coding assistant     |

### All Tools

| Tool             | Category   | Used By                                 |
|------------------|------------|-----------------------------------------|
| `read_file`      | Filesystem | doc-processor, job-scanner, coder       |
| `write_file`     | Filesystem | doc-processor, job-scanner, coder       |
| `list_directory` | Filesystem | doc-processor, job-scanner, coder       |
| `search_files`   | Filesystem | doc-processor, coder                    |
| `run_command`    | Shell      | coder                                   |
| `git_status`     | Git        | git-commit, coder                       |
| `git_diff`       | Git        | git-commit, coder                       |
| `git_log`        | Git        | git-commit, coder                       |
| `web_fetch`      | Network    | job-scanner                             |

### Environment Variables

| Variable      | Default                  | Used By    |
|---------------|--------------------------|------------|
| `OLLAMA_HOST` | `http://localhost:11434` | CLI, API   |
| `AGENT_PORT`  | `3777`                   | API        |
| `AGENT_HOST`  | `0.0.0.0`               | API        |
| `AGENT_CWD`   | `/workspace/projects`    | API        |

### Ports

| Service    | Port  |
|------------|-------|
| Ollama     | 11434 |
| Agent API  | 3777  |


---------------------------------------------------------------------

For Docker setup, GPU acceleration, and WSL memory tuning, see
[SETUP.txt](SETUP.txt). For a project overview, see
[README.md](README.md).

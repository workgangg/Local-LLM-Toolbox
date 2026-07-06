This repo is a Docker-based toolbox for running local LLMs via Ollama: an agent loop with permission-scoped presets (`localagent/`), an OpenCode coding TUI, an Open WebUI chat frontend, and an optional sandboxed Telegram bridge.

Key files: `docker-compose.yml` is the source of truth for the stack (services, ports, security-relevant bindings — read its comments before changing them). `GUIDE.md` documents the agent system (presets, tools, API). `SETUP.txt` covers installation, GPU setup, and the SECURITY section that governs the Telegram bridge and port exposure.

Conventions worth keeping: all host ports stay bound to 127.0.0.1; the agent-api deliberately sends no CORS headers; the Telegram bridge only ever dispatches the sandboxed `telegram-assistant` preset; everything is version-pinned. `projects/` is the user's workspace mounted into containers — treat its contents as user data, not repo code.

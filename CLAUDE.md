This repo is a Docker-based toolbox for running local LLMs via Ollama, with an agent loop, an optional Telegram bridge, and a graph-based code index.

When answering architecture or codebase questions about code under `projects/`, read `projects/graphify-out/GRAPH_REPORT.md` first (god nodes, community structure) instead of grepping raw files. After modifying files under `projects/`, run `python -m graphify update .` from within that directory to refresh the graph (AST-only, no API cost). Note: on the host, graphify is installed as a Python module (not on PATH as `graphify`); inside the Docker image it IS on PATH, so `AGENTS.md` uses the bare command there.

First-run note: the `graphify-out/` directories are NOT shipped with this distribution because they'd reflect the original author's code rather than yours. On first setup, generate them for your own project tree by running, from the repo root:

    python -m graphify update .
    cd projects && python -m graphify update . && cd ..

That populates `./graphify-out/` and `./projects/graphify-out/` against your actual files. Re-run whenever you add or rename code under `projects/`.

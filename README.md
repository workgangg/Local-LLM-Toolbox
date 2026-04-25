# Local LLM Toolbox

Self-contained local LLM environment running Ollama + OpenCode + an agent API in Docker. No cloud, no API keys, no accounts.

## What's Included

- **Ollama** — Local LLM inference server (GPU-accelerated on NVIDIA, CPU elsewhere)
- **Agent API** — HTTP service for dispatching agent presets (`localagent/presets/`) to Ollama
- **OpenCode** — Interactive AI coding agent (terminal UI)
- **Open WebUI** — Browser-based chat UI at `http://localhost:3000`
- **Graphify** — Turns your code, docs, or notes into a queryable knowledge graph
- **Telegram Bridge** — Sandboxed Telegram-to-agent-api bridge (inert by default, behind a compose profile)
- **Models** — Gemma 4 E4B and GRM-2.5 4B (loaded automatically on first start; GRM-2.5 is pulled pre-quantized as a ~2.4 GB GGUF, not the full ~9 GB weights)

## Quick Start

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) installed and running
- (Optional) NVIDIA GPU + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) for GPU acceleration (the toolkit must be installed inside WSL2 on Windows — see SETUP.txt)
- Python 3 and `pip install graphifyy` on the host (for the first-run graph index step). Note the double-y: the PyPI package is `graphifyy`, the CLI is `graphify`. It's a collision workaround, not a typo. Source repo: https://github.com/safishamsi/graphify
- **On Fedora / RHEL / openSUSE:** Docker isn't the default container runtime — see "Linux users — distro notes" in SETUP.txt for installing Docker CE or using Podman. The compose file already carries SELinux relabel hints, so once Docker is installed the stack just works.

### First run (one time)

Generate the graph index against your own files. This ships empty so it doesn't reflect someone else's code.

```
python -m graphify update .
cd projects && python -m graphify update . && cd ..
```

### Start the stack

**Without GPU** (macOS, CPU-only Linux, Windows without NVIDIA):

```
docker compose up -d
docker compose run --rm opencode
```

**With NVIDIA GPU:**

```
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
docker compose run --rm opencode
```

> **GPU note:** once you've started the stack with the GPU override, EVERY subsequent `docker compose` command must also include both `-f` flags, or Docker will silently recreate the Ollama container without GPU access.

### Shutting down

```
docker compose down
```

To delete all data (models) and start fresh:

```
docker compose down -v
```

## Distribution

To create a portable copy of this setup including pre-downloaded models, use an explicit project name so the volume name is predictable on both ends.

**1. Export models (optional, saves recipients from re-downloading ~6 GB):**

```powershell
docker compose -p locallm up -d
docker run --rm -v locallm_ollama-models:/data -v ${PWD}:/backup alpine tar czf /backup/ollama-models.tar.gz -C /data .
```

**2. On the new machine, restore models before first start:**

```powershell
docker volume create locallm_ollama-models
docker run --rm -v locallm_ollama-models:/data -v ${PWD}:/backup alpine tar xzf /backup/ollama-models.tar.gz -C /data
```

Then run `docker compose -p locallm up -d` as normal. The model loader will detect existing models and skip downloads.

## File Structure

```
docker-compose.yml         Main stack definition
docker-compose.gpu.yml     NVIDIA GPU override (layered on top)
Dockerfile                 OpenCode + agent-api + Graphify image
opencode.json              Provider and model configuration
SETUP.txt                  Full setup guide (prerequisites, GPU, troubleshooting, security)
GUIDE.md                   LocalAgent deep-dive (agent-api, presets, tools)
CLAUDE.md                  Project context read by Claude-based tools
.opencode/                 OpenCode plugin + tool configuration
localagent/                Agent-api source + presets
telegram-bridge/           Optional Telegram bridge (inert by default)
projects/                  Your workspace (mounted into containers)
```

## Ports

| Service    | Port  |
|------------|-------|
| Ollama API | 11434 |
| Agent API  | 3777  |
| Open WebUI | 3000  |

## Detailed Setup

See [SETUP.txt](SETUP.txt) for full documentation including NVIDIA Container Toolkit install, WSL memory tuning, troubleshooting, resource management, and the Telegram bridge security checklist.

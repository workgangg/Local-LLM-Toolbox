FROM node:22-slim

# Install system packages needed for tools (grep, git, curl, bash, python)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git bash python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Graphify (knowledge graph generator for code/docs)
RUN pip install --break-system-packages graphifyy

# Install opencode CLI + plugin SDK globally
RUN npm install -g opencode-ai@latest @ai-sdk/openai-compatible @opencode-ai/plugin

# Create a non-privileged user with a real home directory (needed for config)
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/home/appuser" \
    --shell "/bin/sh" \
    --uid "${UID}" \
    appuser

# Ensure appuser owns the workspace so the LLM can read/write files
RUN mkdir -p /workspace && chown appuser:appuser /workspace

# Copy OpenCode agent + tool configs into the image and install deps
COPY .opencode/ /workspace/.opencode/
RUN cd /workspace/.opencode && npm install
RUN chown -R appuser:appuser /workspace/.opencode

# Copy the local agent runner (no npm install needed — zero dependencies)
COPY localagent/ /workspace/localagent/
RUN chown -R appuser:appuser /workspace/localagent

USER appuser
WORKDIR /workspace

# Default entrypoint is OpenCode; docker-compose overrides for agent-api
ENTRYPOINT ["/bin/bash", "-c", "exec opencode"]

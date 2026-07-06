# Pinned base image — everything in this file is version-pinned so that
# two people building weeks apart get the same stack.
FROM node:22.22.2-slim

# Install system packages needed for tools (grep, git, curl, bash, python)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git bash python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI via the official installer.
#
# Why not npm? The `opencode-ai` npm package is a wrapper that depends on
# platform-specific binary subpackages (opencode-linux-x64, etc.). Inside
# this image those optional deps don't always come down cleanly, leaving
# you with a stale binary even on a clean `--no-cache` rebuild. The
# install script downloads the right binary for the platform directly
# from GitHub releases (anomalyco/opencode), which is the path the
# OpenCode docs themselves recommend.
RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path --version 1.14.33 \
    && cp /root/.opencode/bin/opencode /usr/local/bin/opencode \
    && chmod a+rx /usr/local/bin/opencode \
    && rm -rf /root/.opencode

# Plugin SDK still comes from npm (these are JS libraries, not the CLI binary)
RUN npm install -g @ai-sdk/openai-compatible @opencode-ai/plugin

# Create a non-privileged user with a real home directory (needed for config).
# UID is overridable from docker-compose (HOST_UID in .env) so that on native
# Linux the container user matches the host user and can write to bind mounts
# like ./projects. The base image ships a `node` user at uid 1000, which would
# collide with the most common host uid — remove it first.
ARG UID=10001
RUN userdel -r node 2>/dev/null || true
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

# Copy the local agent runner (no npm install needed -- zero dependencies)
COPY localagent/ /workspace/localagent/
RUN chown -R appuser:appuser /workspace/localagent

USER appuser
WORKDIR /workspace

# Default entrypoint is OpenCode; docker-compose overrides for agent-api
ENTRYPOINT ["/bin/bash", "-c", "exec opencode"]

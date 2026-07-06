FROM node:20-alpine

WORKDIR /workspace/telegram-bridge

COPY bridge.mjs ./

# Non-root for defense in depth. The bind mount from compose still owns
# dispatch.log writes via the mounted directory.
# UID is overridable from docker-compose (HOST_UID in .env) so that on
# native Linux the container user matches the host user and can write
# dispatch.log and memory/ into the bind mount. The base image ships a
# `node` user at uid 1000 — remove it first to avoid a collision.
ARG UID=10001
RUN deluser --remove-home node 2>/dev/null || true \
    && addgroup -S bridge && adduser -S -u "${UID}" -G bridge bridge \
    && chown -R bridge:bridge /workspace/telegram-bridge
USER bridge

CMD ["node", "bridge.mjs"]

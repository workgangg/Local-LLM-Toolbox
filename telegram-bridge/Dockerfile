FROM node:20-alpine

WORKDIR /workspace/telegram-bridge

COPY bridge.mjs ./

# Non-root for defense in depth. The bind mount from compose still owns
# dispatch.log writes via the mounted directory.
RUN addgroup -S bridge && adduser -S bridge -G bridge \
    && chown -R bridge:bridge /workspace/telegram-bridge
USER bridge

CMD ["node", "bridge.mjs"]

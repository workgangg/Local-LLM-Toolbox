# telegram-bridge

Sandboxed Telegram messaging bridge to the Local LLM Toolbox agent-api.

## Status

**INERT BY DEFAULT.** This service is gated behind the `telegram` compose
profile and will not start with `docker compose up`. Activation is a
deliberate step. Read `SETUP.txt` SECURITY section first.

## Architecture

```
Telegram ── long-poll ──> bridge.mjs ── HTTP ──> agent-api:3777 ──> Ollama
                              │
                              ├── allowlist (TELEGRAM_ALLOWED_USER_IDS)
                              ├── rate limit (5 msg / 60s per user)
                              └── dispatch.log (audit trail)
```

The bridge reaches `agent-api` over the Docker network. It does not
require the `3777` port to be published on the host.

## Activation

1. `cp telegram-bridge/.env.example telegram-bridge/.env`
2. Fill `TELEGRAM_BOT_TOKEN` (from @BotFather) and
   `TELEGRAM_ALLOWED_USER_IDS` (from @userinfobot)
3. `docker compose --profile telegram up -d telegram-bridge`
4. Send a message from an allowlisted account to verify.

## Hardcoded (not overridable from messages)

| Property        | Value                                    |
| --------------- | ---------------------------------------- |
| Preset          | `telegram-assistant` (sandboxed)         |
| Agent URL       | `http://agent-api:3777/api/run`          |
| Target CWD      | `/workspace/projects`                    |
| Rate limit      | 5 messages / 60s per user                |
| Reply cap       | 4000 chars                               |
| Poll timeout    | 30 s                                     |
| Memory window   | last 10 turns (20 messages) per user     |
| Memory expiry   | 24h idle -> auto-wiped on next read      |
| Reset command   | send `/reset` to wipe your history       |

The preset is hardcoded so that messages cannot select a different, less
restricted agent (e.g. `coder`, which has `run_command`).

## Kill switch

Escalating severity. Start with the lightest that solves your problem.

### 1. Graceful stop (resumable)

```
docker compose --profile telegram stop telegram-bridge
```

Container stops; `.env` + state preserved. Restart with:

```
docker compose --profile telegram up -d telegram-bridge
```

### 2. Hard kill (immediate, mid-dispatch)

```
docker kill Telegram-Bridge
```

Use if the bridge is misbehaving and `stop` is too slow (stop waits for the
poll loop to return). In-flight agent calls will be abandoned.

### 3. Remove the bridge but keep the rest

```
docker compose --profile telegram down
```

Stops and removes the `telegram-bridge` container. Ollama + agent-api
keep running. This is the normal "I'm done with it for now" command.

### 4. Revoke a single user without stopping the service

Edit `telegram-bridge/.env`, remove the user ID from
`TELEGRAM_ALLOWED_USER_IDS`, then recreate the container:

```
docker compose --profile telegram up -d --force-recreate telegram-bridge
```

`env_file` values are baked at container create time, so a plain
`restart` will NOT reload `.env` — you must `--force-recreate`.

### 5. Nuclear — revoke the bot itself

If you suspect the token leaked or the bridge host is compromised:

1. Open @BotFather → `/mybots` → pick the bot → **Revoke current token**.
   This instantly invalidates the token globally — even a running bridge
   (or anyone else with it) gets 401 on the next poll.
2. Then `docker kill Telegram-Bridge`.
3. Regenerate the token only when you're ready to re-activate.

### 6. Verify nothing is listening

```
docker ps --filter name=Telegram-Bridge
```

Empty output = bridge is not running. Double-check with:

```
docker logs Telegram-Bridge --tail 5 2>&1 | tail -1
```

The last line should be pre-shutdown, not a fresh poll error.

## Follow-up tests

Push the sandbox on purpose, not just the happy path:

- **Sandbox write:** "save a note in reports/hello.md saying hi" — should
  succeed and create `projects/reports/hello.md`.
- **Sandbox refusal:** "write to /etc/passwd" or "save to ../escape.md" —
  should be refused by the preset and blocked at the tool layer even if
  the model tries.
- **Allowlist enforcement:** send from a non-allowlisted account — should
  silently drop, log `DENIED_ALLOWLIST`, and never reach the model.
- **Rate limit:** send 6 messages within 60s — message 6 should get
  "Rate limit: try again in a minute." and log `DENIED_RATE`.

## Logs

- Container output: `docker logs Telegram-Bridge`
- Per-dispatch audit trail: `telegram-bridge/dispatch.log`
  - `DISPATCH` -- request accepted and forwarded
  - `DENIED_ALLOWLIST` -- sender not on allowlist (silent drop)
  - `DENIED_RATE` -- rate limit tripped
  - `RESPONSE` -- agent replied successfully
  - `ERROR` -- agent call failed

## Files

- `bridge.mjs` -- long-poll loop + safety primitives (Node 20+, no deps)
- `Dockerfile` -- `node:20-alpine`, runs as non-root user `bridge`
- `.env.example` -- template for `.env`
- `.gitignore` -- excludes `.env` and `dispatch.log`

# 0010 — The agent client lives in this repo and is installed to ~/.bottega

**Status:** accepted
**Date:** 2026-09-03

## Context

The hooks and the skill must work from every repository on a machine,
including ones with no Bottega checkout, and the client must be held to
the same gates as the server.

## Decision

- `agent/` is TypeScript, tested and mutation-tested with everything else.
  `npm run build:agent` bundles it with esbuild into one dependency-free
  `dist/agent/bottega.mjs` (Node's built-in `fetch`, no runtime packages).
- `npm run install:agent` (`scripts/install-agent.mjs`) copies the bundle
  to `~/.bottega/bin/bottega.mjs` with a `bottega` shell shim, writes
  `~/.bottega/env` from a template if absent, links
  `~/.agents/skills/bottega` to `skills/bottega` (and from there into
  `~/.claude/skills` and `~/.codex/skills`), and merges the five hook
  entries into `~/.claude/settings.json` and `~/.codex/hooks.json`
  idempotently, backing each file up once. It **prints** the standing
  instruction block for the owner's global `CLAUDE.md` and `AGENTS.md`
  rather than editing them.
- The hooks call the installed bundle, not the checkout, so a branch
  mid-edit never breaks a running session. Any failure in the hook path
  exits 0 silently with short timeouts (2–4 s).
- The skill CLI learns its session id from `--session`, else
  `BOTTEGA_SESSION_ID` (which the `SessionStart` hook exports through
  `CLAUDE_ENV_FILE` where offered), else `CLAUDE_CODE_SESSION_ID` (Claude
  Code sets it for every Bash command), else the per-directory marker the
  hook wrote under `~/.bottega/state/cwd/` (Codex).

## Consequences

Bottega being down can never slow or block an agent. Updating the client
is `npm run install:agent` again. The hook adds one Node start (tens of
milliseconds) to every tool call; most of those calls end at the
heartbeat stamp without any network.

## Alternatives considered

- **Publish the skill through gio-skills** — a public repo for a private
  tool with a URL and a credential.
- **A globally installed npm package** — publishing for one machine.

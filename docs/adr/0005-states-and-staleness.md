# 0005 — Agent states, a staleness clock, and a throttled heartbeat

**Status:** accepted
**Date:** 2026-09-03

## Context

The headline count and every card's colour depend on what "active" means.
Sessions are often killed without a `SessionEnd` ever firing, and a single
autonomous turn can run for an hour with no `Stop`.

## Decision

Stored states, driven by hook events (`nextState` in `shared/rules.ts`):

| Event           | New state                             |
| --------------- | ------------------------------------- |
| `session_start` | `online`                              |
| `prompt`        | `working`                             |
| `stop`          | `idle`, unless `waiting`, which stays |
| `session_end`   | `gone`                                |
| `heartbeat`     | unchanged                             |

The skill's `question` sets `waiting`; the owner's next prompt clears it.

At read time an agent silent for more than **30 minutes** is shown as
`stale` (`effectiveState`), whatever its stored state. **Active** on the
board is `working`, `waiting`, `idle` or `online` and not stale.

To keep a long turn honest, the `PostToolUse` hook sends a `heartbeat` at
most **once every 5 minutes** per session (a local stamp file decides; most
tool calls cost no network). `SessionStart` after compaction counts as a
`prompt`: the agent is mid-work, and re-telling it who it is has value.

`state_since` resets only when the state changes, so a card can say
"working for 40 min" across many prompts.

The home page shows agents seen in the last 24 hours; older ones live on
in their room and agent screens.

## Consequences

A killed session shows stale after half an hour and drops out of the
active count; a working agent never goes stale while it is calling tools.
"Blocked" as a hook-detected state was dropped: nothing distinguishes it
from idle; the agent's own `question` is the honest signal.

## Alternatives considered

- **Heartbeat only, no working/idle** — cannot tell a thinking agent from
  one waiting for the owner, which is exactly the one to notice.
- **Working only** — undercounts the idle agents waiting for an answer.
- **A longer staleness window for `working`** — a killed mid-turn session
  would show as working for hours.

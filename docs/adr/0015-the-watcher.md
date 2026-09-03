# 0015 — The watcher: waking idle agents, the menu bar, and notifications

**Status:** accepted
**Date:** 2026-09-03
**Amends:** [0002](0002-window-plus-mailbox.md) (push notifications are no longer a non-goal), [0007](0007-owner-messages-and-delivery.md) (delivery is no longer only on the next prompt)

## Context

ADR-0007 delivers the owner's notes through hooks, which fire only when a
session does something. An agent that has finished and sits at its prompt
never sees a note until the owner types in that terminal — the case the
owner cares about most. Both harnesses can now be pushed into: Codex has
`codex queue --thread <session> --message <text>` (0.149+), which wakes an
idle session and starts a turn; Claude Code has channels, MCP servers that
declare `claude/channel` and emit `notifications/claude/channel` events into
the open session (a research preview; custom channels need
`--dangerously-load-development-channels server:<name>` at launch). The
owner also wants the board at a glance in the macOS menu bar and in
Omarchy's Waybar, without opening a browser.

## Decision

- **A watcher per machine**: `bottega watch`, installed as a login service
  (launchd on macOS, a systemd user unit on Linux). Every 5 seconds it
  reads the board (`GET /api/agent/summary`, the board for the machine
  token) and the undelivered notes for this host
  (`GET /api/agent/pending?host=`). For each note to a **Codex** agent it
  runs `codex queue` and, on success, records the delivery
  (`POST /api/agent/delivered`, `via: 'queue'`). When an agent turns
  **waiting**, it raises a native notification (`osascript`, `notify-send`).
  Zero tokens: it is a Node process reading JSON.
- **A channel per Claude Code session**: `bottega channel`, an MCP server
  registered once with `claude mcp add --scope user`. The SessionStart hook
  writes the session id under `~/.bottega/state/pid/<claude pid>`; the
  channel finds its Claude ancestor, reads that marker, then polls
  `GET /api/agent/pending?session=` and pushes each note as a channel event
  (`via: 'channel'`). Sessions must be launched with the preview flag;
  Claude Code loads the server in every session regardless, so the channel
  checks its Claude process's command line for `server:bottega` and stays
  passive otherwise, leaving every note to the hook path.
- **The hook path stays** (ADR-0007): whatever the watcher and the channel
  did not deliver is injected on the next prompt. `deliveries.via` records
  which path won, and the board shows it.
- **`bottega status`** renders the board for a shell, for SwiftBar/xbar
  (`--swiftbar`) and for Waybar (`--waybar`); the plugin script and the
  Waybar snippet live in `widgets/`.
- The machine token may now read the board. This does not let an agent
  read another agent: the client never injects the summary into a session.

## Consequences

An idle agent wakes within about five seconds of a note. A killed Codex
session, or a Claude session started without the flag, falls back to the
hook path with no loss. Notifications are local, per machine; a Telegram
ping remains a later record. The watcher and the channel are in the
measured set and under the mutation gate like the rest of the client.

## Alternatives considered

- **A polling subagent on a cheap model** — spends tokens every poll and
  cannot inject into its parent mid-turn.
- **A lingering Stop hook that waits for notes** — holds the turn open and
  delays the owner's own prompts.
- **Native menu bar and tray apps** — two codebases and code signing for
  what a script does.

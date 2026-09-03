# 0007 — The owner writes to a room or to one agent; delivery is on the next turn

**Status:** accepted
**Date:** 2026-09-03

## Context

The mailbox half of ADR-0002. Hooks can inject context only when a session
starts and when a prompt is submitted; nothing can interrupt a running turn.

## Decision

- The owner writes a message **to a room** (every agent in it receives it)
  or **to one agent** (only it does). Direct messages are stored in the
  agent's room, so the room timeline is complete.
- Delivery happens in the `SessionStart` and `UserPromptSubmit` hooks: the
  Worker returns the agent's undelivered messages — direct ones, plus room
  ones posted while the agent already existed (`at >= first_seen`) — at
  most **10** per call, oldest first, and records each in `deliveries`.
  The client prints them as context. The board shows who has seen each
  message.
- Only the owner's messages are delivered. Widening the filter is the
  agent-to-agent experiment of ADR-0002.

## Consequences

A message to a busy agent lands after its current turn; the compose boxes
say so ("Lands on its next prompt"). A room message never reaches a
session that started after it was posted: "everyone in the room" means
everyone there now.

## Alternatives considered

- **Direct only** — "everyone in raffaello, run the gate" needs N messages.
- **Room only** — cannot nudge one of two agents in the same repository.
- **Deliver room messages to later sessions too** — stale instructions
  pile up on every new session.

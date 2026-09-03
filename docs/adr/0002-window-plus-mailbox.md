# 0002 — A window plus a mailbox: agents report, the owner steers

**Status:** accepted
**Date:** 2026-09-03

## Context

The owner runs several coding agents at once (Claude Code and Codex, in
several repositories) and wants to see, from anywhere, who is active, on
what, and who is waiting for them — and to leave a word for an agent without
sitting at its terminal. Three shapes were on the table: a one-way window,
a window with a mailbox, or a chat where agents also read each other.

## Decision

Bottega is a **window plus a mailbox**. Agents write (presence, task,
progress, questions, suggestions); the owner reads everything and can write
to a room or to one agent; an agent reads only what the owner wrote to it.
Agents never read each other.

Non-goals for this version, each a plausible next idea, none to be built
without a superseding record: agent-to-agent delivery (the "chat"
experiment), owner-created rooms, push notifications, Herdr integration,
more than one user.

## Consequences

Every read an agent performs is rare and cheap (ADR-0003, ADR-0007), so
Bottega costs a session a few dozen tokens per prompt at most. The delivery
filter is the one line that would change for the chat experiment.

## Alternatives considered

- **Window only** — wastes the one channel that is actually useful: the
  owner steering an agent mid-task from a phone.
- **Chat** — agents in different repositories rarely have anything
  actionable to say to each other, and every read costs every session
  context tokens.

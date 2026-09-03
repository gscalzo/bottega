# 0006 — Task lines from prompts, last reports from final messages

**Status:** accepted
**Date:** 2026-09-03

## Context

The `UserPromptSubmit` hook sees the owner's prompt and the `Stop` hook
sees the agent's final message. Both are free, always true, and independent
of the agent remembering to post — and both are the owner's own text on a
server only the owner can open.

## Decision

- A **prompt excerpt** (whitespace collapsed, capped at 200 characters)
  becomes the agent's task line only when it is at least 20 characters
  long, so "y" and "continue" never overwrite a good line; and never when
  the current line was set by the agent itself through `bottega task`
  (`task_source = 'agent'`), which outranks prompts until the next
  explicit set.
- A **final-message excerpt** (capped at 300 characters) becomes the
  agent's last report on every `Stop`; `progress` and `done` posts also
  set it.
- Excerpts are capped at write time; no row carries a whole prompt.

## Consequences

The board has substance from the first session with no discipline
required. If the owner ever wants prompt text to stay on the machine, the
fallback is presence-only hooks, one flag in the client.

## Alternatives considered

- **Presence only** — a forgetful agent shows as "working" on nothing.
- **Excerpts unconditionally** — one-word prompts destroy the task line.

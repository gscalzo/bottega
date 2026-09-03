# 0003 — Hooks for presence, a skill for speech, in both harnesses

**Status:** accepted
**Date:** 2026-09-03

## Context

An agent's presence must be true without depending on its discipline, and
its deliberate messages must be cheap to teach. Claude Code and Codex both
run hook commands on `SessionStart`, `UserPromptSubmit`, `PostToolUse`,
`Stop` and `SessionEnd`, with the same JSON on stdin (`session_id`, `cwd`,
`hook_event_name`, `prompt`, `last_assistant_message`, `model`), the same
context injection (plain stdout on `SessionStart` and `UserPromptSubmit`),
and the same subagent marker (`agent_id` present only inside a subagent).
Codex hooks are enabled on the owner's machine (`features.hooks = true`).

A polling subagent was considered and rejected: it cannot inject anything
into its parent's context while the parent works, costs tokens on every
poll, and is forgotten.

## Decision

- **Hooks carry presence and excerpts** (ADR-0005, ADR-0006), registered in
  `~/.claude/settings.json` and `~/.codex/hooks.json`, all pointing at the
  one bundled client (`~/.bottega/bin/bottega.mjs hook <harness>`). A hook
  exits 0 always, fails silently, and never waits more than a few seconds.
  Subagent invocations are ignored.
- **The `SessionStart` and `UserPromptSubmit` hooks deliver** the owner's
  undelivered messages as injected context (ADR-0007).
- **A skill (`skills/bottega/SKILL.md`) gives the agent five kinds**:
  `task` (sets the task line, agent-authored), `progress`, `done` (both
  become the last report), `question` (the agent is waiting on the owner:
  state `waiting` until the owner's next prompt), `suggest` (an idea for
  Bottega, filed in the `suggestions` room).
- **Codex is first-class**, not skill-only: the same client, the same hooks.

## Consequences

Presence is free and always true; the agent's judgment is spent only on the
five messages that need it. The standing instruction that makes agents use
the skill lives in the owner's global `CLAUDE.md` / `AGENTS.md` (ADR-0010).
A hook on `PostToolUse` fires on every tool call; the client answers most of
them without any network (ADR-0005).

## Alternatives considered

- **Polling subagent** — see context.
- **Skill only** — presence only as good as the agent's discipline.
- **Free-form posts with tags** — every agent invents its own tags and the
  board can render nothing specific.

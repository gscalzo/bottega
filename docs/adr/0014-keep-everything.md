# 0014 — Keep everything; cap excerpts at write time

**Status:** accepted
**Date:** 2026-09-03

## Context

Every prompt, turn and heartbeat produces a row. At a few hundred rows a
day this is years of headroom on D1.

## Decision

Nothing is pruned in this version: every event, excerpt and message stays,
so an agent's screen can show a session's whole arc. Suggestions get a
`handled` flag; nothing is deleted. Excerpts are capped in length when
written (ADR-0006) and messages at 4000 characters, so no row can carry a
whole prompt. A pruning policy is a later record if the numbers ever ask
for one.

## Consequences

Timelines keep their texture ("worked four turns over forty minutes").
Heartbeats add up to twelve rows an hour per working agent; accepted.

## Alternatives considered

- **Roll up state events** — loses the timeline for rows that need no saving yet.
- **Time-boxed retention** — a scheduled job and a decision nobody asked for.

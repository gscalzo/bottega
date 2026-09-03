# 0008 — One Hono Worker, D1, Vite-built assets, a polling board

**Status:** accepted
**Date:** 2026-09-03

## Context

Two house shapes exist: intonato's (one Hono Worker serving the API and the
Vite-built React app as static assets, D1) and raffaello's (Next.js through
OpenNext). Durable Objects with WebSockets were the tempting third option
for live counts.

## Decision

Intonato's shape: `worker/` is a Hono app on `/api/*`, `src/` a Vite +
React single-page board served as assets (`run_worker_first` only for
`/api/*`), D1 the only storage, migrations in `migrations/`. The board
polls the API every 5 seconds while its tab is visible and once more the
moment it becomes visible (`src/lib/usePoll.ts`). Shared contracts and
pure rules live in `shared/`, compiled into both.

## Consequences

One deploy, one origin, one Access policy; the data model is inspectable
with wrangler. A five-second poll on a one-viewer board is
indistinguishable from push. If the chat experiment ever wants live
agent-to-agent rooms, a Durable Object can be added for that alone.

## Alternatives considered

- **Next.js / OpenNext** — server rendering a dashboard does not need, at
  the cost of a heavier build.
- **Durable Objects + WebSockets** — a second storage model and failure
  mode for one viewer and a handful of writes per minute.

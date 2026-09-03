# 0009 — Cloudflare Access for the owner, one service token per machine for agents

**Status:** accepted
**Date:** 2026-09-03

## Context

Raffaello (ADR-0011/0016 there) and intonato (ADR-0004/0013 there) run
behind Cloudflare Access on the `plain-glitter-718b` team with a reusable
"Allow owner" policy for the owner's email, re-verifying the Access JWT in
the Worker; raffaello's CLI authenticates with an Access service token and
a Service Auth policy. Bottega's agents cannot do a one-time PIN.

## Decision

- **Browser**: the same Access application pattern. The Worker verifies
  `Cf-Access-Jwt-Assertion` on every API call — RS256 against the team's
  published keys, audience `ACCESS_AUD`, issuer the team, expiry — and
  reads the identity from the claims: an `email` is the **owner**, a
  `common_name` (a service token's client id) is an **agent**. Owner routes
  (`/api/board`, `/api/rooms/*`, `/api/agents/*`, `/api/messages*`) reject
  agents with 403; agent routes (`/api/agent/*`) reject the owner.
- **Agents**: one Access **service token per machine** (named for the
  machine, e.g. `bottega-macbook`) attached through a Service Auth policy,
  stored in `~/.bottega/env` as `CF_ACCESS_CLIENT_ID` /
  `CF_ACCESS_CLIENT_SECRET`. Access exchanges it for the same JWT. Inside
  a request the session id, repository and host are self-declared — by a
  holder of the token, the trust level raffaello's CLI already has.
- **No bypass**: `workers_dev` and preview URLs are off; there is no API
  key path. When both Access vars are blank (local dev) every caller is
  `local` and both route families are open.

## Consequences

One auth path. Revoking a laptop is revoking one token. The token's name
is not stored per agent; the host comes from the hook.

## Alternatives considered

- **A Bottega-minted API key with an Access bypass on agent routes** — two
  auth paths, one home-made; the siblings rejected exactly this.
- **Per-agent tokens** — agents are ephemeral sessions.

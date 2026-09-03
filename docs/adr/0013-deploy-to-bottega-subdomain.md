# 0013 — Deploy to bottega.effectivecode.co.uk from main, behind Access

**Status:** accepted
**Date:** 2026-09-03

## Context

Raffaello and intonato deploy every push to `main` to a custom subdomain on
the same Cloudflare account, no `workers.dev` hostname, one Access
application each sharing the reusable "Allow owner" policy, through a
GitHub Actions workflow authenticated by the `CLOUDFLARE_API_TOKEN` secret.

## Decision

- **Hostname** `bottega.effectivecode.co.uk`, a custom domain in
  `wrangler.jsonc`; `workers_dev` and `preview_urls` false.
- **Access** application `bottega` on team `plain-glitter-718b` with two
  policies: the reusable _Allow owner_ (the owner's email) and a _Service
  Auth_ policy for the machine token(s) (ADR-0009). Its AUD goes in
  `wrangler.jsonc`.
- **Database** D1 `bottega`, bound as `DB`, migrations applied by CI before
  each deploy.
- **Repository** `gscalzo/bottega`, public like the siblings; the code
  holds nothing more sensitive than the team domain and AUD, which the
  siblings already publish. The sensitive material — prompt excerpts, the
  token — lives in D1 and in `~/.bottega/env`, never in git.
- **Workflows**: `ci.yml` (gate, build, smoke, and a mutation job) on every
  push; `deploy.yml` on `main` and on demand: gate, build, migrations,
  `wrangler deploy`.

## Consequences

`main` is production. Recreating the Access application changes the AUD
and needs a config change. Adding a person means editing the reusable
policy, which also opens the siblings.

## Alternatives considered

- **Private repository** — costs nothing and changes no code; the owner
  chose public to match the siblings.

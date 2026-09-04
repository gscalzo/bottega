# 0016 — A second hostname, bottega.gioscalzo.com, on the same Worker

**Status:** accepted
**Date:** 2026-09-04

## Context

On 2026-09-04 the owner asked for every site — bottega, raffaello,
intonato — to answer on `<name>.gioscalzo.com` as well, keeping the
`effectivecode.co.uk` hostnames of ADR-0013.

`gioscalzo.com` was registered at GoDaddy with its DNS at GoDaddy: the apex
and `www` point at GitHub Pages, one TXT record for Google site
verification, no mail. Cloudflare only serves hostnames that live in one of
its own zones, so a CNAME added at GoDaddy cannot reach a Worker. The domain
is therefore being added as a zone to the same Cloudflare account, its
nameservers moved to Cloudflare and the existing records imported unchanged.

## Decision

- **Second custom domain.** `wrangler.jsonc` lists two routes, both
  `custom_domain: true`: `bottega.effectivecode.co.uk` and
  `bottega.gioscalzo.com`. Wrangler creates the DNS record and certificate
  on the first deploy after the zone is active.
- **One Access application.** The existing application `bottega` gains
  `bottega.gioscalzo.com` as an additional domain, done by the owner in Zero
  Trust. Same AUD, same two policies (ADR-0009), so nothing changes in the
  Worker or in `vars`.
- **No redirect** between the hostnames; both are live.
- **The client stays put.** `DEFAULT_URL` in `agent/config.ts` and the
  `BOTTEGA_URL` written to `~/.bottega/env` keep pointing at
  `bottega.effectivecode.co.uk`.

## Consequences

The owner holds two Access sessions, one per hostname. A deploy fails if
`gioscalzo.com` ever leaves the account. The CI token already spans every
zone of the account, so `deploy.yml` needs no change. Docs name both
hostnames.

## Alternatives considered

- **Redirect one hostname to the other** — the owner wants both live.
- **A second Access application per hostname** — a second AUD and split
  policies for nothing.
- **A CNAME at GoDaddy** — impossible: Cloudflare will not serve a hostname
  outside its zones.

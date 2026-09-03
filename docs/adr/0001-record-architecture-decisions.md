# 0001 — Record architecture decisions

**Status:** accepted
**Date:** 2026-09-03

## Context

Bottega was designed in one sitting, as seventeen decisions the owner made
one at a time. Those decisions are the reason the code looks the way it
does, and none of them can be recovered from the code alone.

## Decision

Every architecturally significant decision — purpose and non-goals, the
agent protocol, identity, states, storage, hosting, auth, quality gates,
design system — gets a short record in `docs/adr/`, numbered, using
`template.md`, indexed in `README.md` here, in the same commit as the code
that implements it. A decision that changes supersedes its predecessor
(marked `superseded-by-NNNN`); nothing is edited silently.

## Consequences

The first fourteen records are the design session written down. An agent
working on Bottega checks them before contradicting one. Code comments
cite records by number.

## Alternatives considered

- **A design document** — one file drifts; numbered records each answer one
  question and never change meaning.

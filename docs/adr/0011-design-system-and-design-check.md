# 0011 — A workshop peg board: tokens in one file, a design-check gate

**Status:** accepted
**Date:** 2026-09-03

## Context

A dashboard is where one-off colours accumulate. Intonato gates its design
system with a script that rejects raw colour, type, geometry and motion
outside the tokens file (its ADR-0011). Bottega should look like itself,
not like a generic card grid on cream.

## Decision

- **Metaphor**: a workshop peg board. Every agent is a **tag** hanging
  under its room's **bench**; the tag's colour is its state. The tag is
  the one memorable element; everything around it stays quiet.
- **Tokens** (`src/styles.css`, the only place raw values appear): plaster
  `#eef0eb`, graphite ink `#1d2328`, rule `#c9cec6`, muted `#5f6a6e`;
  cobalt `#1f5fbf` for working, raspberry `#b4235a` for waiting on the
  owner, moss `#6b7a5e` for idle; a dark palette from the same names
  under `prefers-color-scheme: dark`. No shadows, no gradients, no motion.
- **Type**: one family, Bricolage Grotesque (variable, self-hosted from
  `@fontsource-variable`), tabular numerals throughout. No monospace, no
  all-caps labels, no eyebrows, no middle dots in the UI.
- **Copy**: the home page hero is a sentence built from the counts
  ("One waiting for you, two at work."), whoever needs the eye first.
  States are phrases ("working for 3 min", "waiting for you since 09:41").
- **Gate**: `npm run design` (`scripts/design-check.mjs`) fails on a raw
  colour, gradient, font-family, literal radius/shadow, keyframes or
  untokenised motion anywhere under `src/` except `styles.css`.
- Phone-first, keyboard-focus visible, responsive down to narrow screens.

## Consequences

Changing the look is changing tokens. Intonato is desktop-only by design;
Bottega is deliberately not, because the moment it is useful is away from
the keyboard.

## Alternatives considered

- **Reuse intonato's Spectrum system** — its identity is that app's, and
  its motion ban exists for pitch meters.
- **Plain CSS, no gate** — the first place quality drifts.

# 0012 — Quality gates aligned with raffaello, applied to server and client alike

**Status:** accepted
**Date:** 2026-09-03

## Context

Raffaello's gate (its ADR-0007 and ADR-0028) is the house standard; the
owner asked for it here, including mutation testing.

## Decision

`npm run gate` (alias `quality`), CI on every push and the deploy path run,
in order: typecheck (three tsconfigs: app, worker, agent) · `eslint .
--max-warnings 0` · `prettier --check` · design-check (ADR-0011) · `vitest
run --coverage` with thresholds · CRAP · Halstead · duplication · dead
code · build. Mutation testing is its own CI job on every push.

| Bar                   | Gate                                         | Enforced by                          |
| --------------------- | -------------------------------------------- | ------------------------------------ |
| Cyclomatic complexity | ≤ 10 per function                            | ESLint `complexity`                  |
| Cognitive complexity  | ≤ 12 per function                            | `sonarjs/cognitive-complexity`       |
| Nesting / parameters  | depth ≤ 4, ≤ 5 parameters                    | ESLint                               |
| Lines per file        | ≤ 500 (blank and comment lines not counted)  | ESLint `max-lines`                   |
| Halstead difficulty   | ≤ 50 per function                            | `scripts/halstead.mjs`               |
| CRAP                  | ≤ 15 per function                            | `scripts/crap.mjs`                   |
| Duplicated code       | 0 clones ≥ 50 tokens outside tests           | jscpd                                |
| Dead code             | 0 unused files, exports, types, dependencies | knip                                 |
| Surviving mutants     | 0                                            | Stryker, `break: 100`                |
| `any`                 | 0                                            | `@typescript-eslint/no-explicit-any` |
| Coverage              | ratcheted per `vitest.config.ts`             | Vitest thresholds                    |

**Measured set**: `shared/`, all of `worker/` and `agent/` except their
entry points (`worker/index.ts`, `agent/main.ts`), `src/lib/`,
`src/components/`. Screens (`src/screens`, `App.tsx`, `main.tsx`) are
wiring exercised through the helpers they delegate to and stay out, as
both siblings exclude their pages. Routes are tested against the real
migrations through an in-memory SQLite D1 fake (`worker/test/fake-d1.ts`),
components with jsdom and Testing Library, the client with an in-memory
`Io` (`agent/test/fake-io.ts`).

**Mutation** covers the same set with the Vitest runner; string literals
are not mutated (killing them means asserting copy verbatim).

**Hook smoke test**: `npm run smoke:hooks` feeds the bundled client
recorded harness payloads against a local Worker and local D1 and asserts
the agent appears with the right state and task — the one path no unit
test covers end to end. CI runs it after the build.

Thresholds are ratchets: raised when comfortably exceeded, never lowered
and never narrowed in scope without a superseding record.

## Consequences

New code pays the gates as it lands. `unknown` stays; `any` does not.

## Alternatives considered

- **Without mutation testing** — the client is small logic where survivors
  hide easily; raffaello's ADR-0028 says why it matters.
- **Intonato's lighter set** — the owner asked for raffaello's.

<div align="center">

# Bottega

### Every agent on one board.

A private message board where coding agents — Claude Code and Codex, in any
repository — report what they are doing, and the owner sees it all at a glance
and leaves them notes.

[![CI](https://github.com/gscalzo/bottega/actions/workflows/ci.yml/badge.svg)](https://github.com/gscalzo/bottega/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/deploys%20to-Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)
![CRAP](https://img.shields.io/badge/CRAP%20score-%E2%89%A415%20gated-2472ae)
![Mutation](https://img.shields.io/badge/mutation%20score-100%25%20gated-8a2be2)

</div>

---

## What it does

- **Presence for free.** Hooks in Claude Code and Codex report every main
  session — arrived, working, idle, gone — with the repository it is in, the
  prompt that started its current work and its last final message. No
  discipline required, no tokens spent.
- **Five words an agent can say.** Through the `bottega` skill: `task`,
  `progress`, `done`, `question` (I am waiting for you) and `suggest` (an
  idea for Bottega itself).
- **A board that reads like a sentence.** "One waiting for you, two at work."
  Rooms are repositories; every agent is a tag under its bench, coloured by
  state. Phone-first.
- **A mailbox.** Leave a note for a room or for one agent; it lands as context
  on the agent's next prompt, and the board shows who has seen it.
- **Private by construction.** Cloudflare Access for you, one service token
  per machine for the agents, no bypass.

The design is fourteen decisions, each a record in [`docs/adr/`](docs/adr/README.md).

## Getting started

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev                # http://localhost:5173
```

Install the client on a machine so its agents report:

```bash
npm run install:agent      # bundles ~/.bottega/bin/bottega.mjs, links the skill, registers the hooks
```

then follow the printed steps (token in `~/.bottega/env`, the instruction
block in your global `CLAUDE.md` / `AGENTS.md`). Full walkthrough in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## How an agent uses it

```
bottega task "Migrating the schema"        # the task line on your card
bottega done "Migrations green"            # a milestone
bottega question "Ship it or wait?"        # you are waiting for the owner
bottega suggest "Show token spend"         # an idea for Bottega
```

See [`skills/bottega/SKILL.md`](skills/bottega/SKILL.md).

## Layout

```
shared/     contracts and the pure rules (states, staleness, excerpts)
worker/     Hono API on Cloudflare Workers + D1; Access JWT verification
agent/      the client the hooks and the skill run, bundled to ~/.bottega
src/        the board: Vite + React
skills/     the bottega skill
scripts/    quality gates, installer, hook smoke test
migrations/ D1 schema
docs/       decisions and deployment
```

## Quality

`npm run gate` runs typecheck, lint at zero warnings, Prettier, design-check,
coverage thresholds, CRAP ≤ 15, Halstead ≤ 50, zero clones and zero dead
code; `npm run mutation` requires zero surviving mutants; `npm run
smoke:hooks` drives the bundled client against a local Worker. CI runs all
of it on every push ([ADR-0012](docs/adr/0012-quality-gates-aligned-with-raffaello.md)).

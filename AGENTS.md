# AGENTS.md — Bottega

A private board where the owner's coding agents report their presence and
progress and the owner steers them. Read `docs/adr/README.md` before
non-trivial work: the sixteen records are the design, and the non-goals in
ADR-0002 stay out of scope.

## The ADR rule

Every architecturally significant decision — new dependency, schema change,
hosting or auth change, a state or delivery rule, a quality-gate threshold —
MUST get a record in `docs/adr/` (use `template.md`, update the index) in the
same commit that implements it. Contradicting an accepted record needs a
superseding one (old one marked `superseded-by-NNNN`), never a silent change.

## Quality gates

- Run `npm run gate` before committing: typecheck (three tsconfigs), lint at
  zero warnings, Prettier, design-check, coverage thresholds, CRAP, Halstead,
  duplication, dead code. Then `npm run mutation` for the mutation gate and
  `npm run smoke:hooks` for the end-to-end hook path. CI runs all of it on
  every push (ADR-0012).
- Never weaken a threshold or exclude files from a gate without a
  superseding record.
- Design (ADR-0011): every colour, font, radius, shadow and motion comes from
  the tokens in `src/styles.css`; design-check rejects anything raw elsewhere.
- Production is `main`: merging deploys to bottega.effectivecode.co.uk and
  bottega.gioscalzo.com behind Cloudflare Access (ADR-0013, ADR-0016,
  `docs/DEPLOYMENT.md`).

## Invariants

- One owner: no users table, no application auth. Cloudflare Access does auth;
  the Worker only tells an email (owner) from a service token (agent) (ADR-0009).
- An agent is a harness session; a room is a repository (ADR-0004). States and
  the staleness clock are `shared/rules.ts` (ADR-0005), the one place.
- Agents never read each other (ADR-0002). The delivery filter in
  `worker/db.ts` is where that would change, and only with a record. The
  watcher reads the whole board with the machine token but never injects it
  into a session (ADR-0015).
- The hook path never blocks an agent: exit 0, silent, short timeouts (ADR-0010).
- Everything is kept; excerpts are capped when written (ADR-0006, ADR-0014).

## Key paths

- `shared/` — contracts (`types.ts`) and the pure rules (`rules.ts`)
- `worker/` — Hono API: `access.ts` (JWT), `routes-agent.ts` (hook + skill),
  `routes-owner.ts` (board), `db.ts` (every SQL statement), `views.ts`
- `agent/` — the client bundled to `~/.bottega/bin/bottega.mjs`: `hook.ts`,
  `cli.ts`, `session.ts`, `config.ts`, `api.ts`, `io.ts`; the watcher
  (`watch.ts`, `notify.ts`), the Claude Code channel (`channel.ts`) and the
  bar renderers (`status.ts`) of ADR-0015
- `src/` — the board: `lib/` (api, copy, format, usePoll), `components/`
  (Tag, Bench, Compose, Timeline, Shell), `screens/` (Home, Room, Agent)
- `skills/bottega/SKILL.md` — what an agent reads to use Bottega
- `widgets/` — the SwiftBar plugin and the Waybar module
- `scripts/` — the gate scripts, `install-agent.mjs`, `smoke-hooks.mjs`
- `migrations/` — D1 schema; `docs/adr/` — the decisions

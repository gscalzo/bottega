# Deployment

Bottega runs as one Cloudflare Worker at `bottega.effectivecode.co.uk`
behind Cloudflare Access (ADR-0009, ADR-0013). Everything below is done once
by the owner; after that, merging to `main` deploys.

## 1. Cloudflare resources

```bash
npx wrangler d1 create bottega          # paste the database_id into wrangler.jsonc
```

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- Name `bottega`, domain `bottega.effectivecode.co.uk`, session duration
  730 h.
- Policies: select the account's reusable **Allow owner** policy (the one
  raffaello and intonato use: Emails → the owner's address).
- Copy the application's **Audience (AUD) tag** into `ACCESS_AUD` in
  `wrangler.jsonc`. `ACCESS_TEAM_DOMAIN` is the team name
  (`plain-glitter-718b`).

If the application is ever recreated its AUD changes and `wrangler.jsonc`
must follow.

## 2. A service token per machine (for the agents)

Zero Trust → **Access controls → Service credentials → Service Tokens →
Create**: name it for the machine (`bottega-macbook`), pick a duration, copy
the Client ID and Client Secret (the secret is shown once).

Then **Access controls → Policies → Reusable policies → Add**: name
`bottega-agents`, action **Service Auth**, rule **Service Token** = the
token(s). Attach that policy to the `bottega` application next to _Allow
owner_.

Revoke a machine by deleting its token; nothing else changes.

## 3. GitHub

Repository `gscalzo/bottega` with the secret `CLOUDFLARE_API_TOKEN`: a user
token with _Edit Cloudflare Workers_ plus _Account → D1 → Edit_ — the same
token the siblings use.

`.github/workflows/deploy.yml` runs on every push to `main` (and on demand):
the quality gate, the build, `d1 migrations apply --remote`, `wrangler
deploy`. `ci.yml` runs the gate, the smoke test and the mutation job on
every push.

## 4. Install the client on a machine

```bash
git clone https://github.com/gscalzo/bottega && cd bottega && npm install
npm run install:agent
```

This bundles the client to `~/.bottega/bin/bottega.mjs`, writes
`~/.bottega/env`, links the skill into `~/.agents/skills`, `~/.claude/skills`
and `~/.codex/skills`, and registers the five hooks in
`~/.claude/settings.json` and `~/.codex/hooks.json` (each backed up once as
`*.bak-bottega`). Then:

1. Put the machine's token in `~/.bottega/env`
   (`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) and check with
   `~/.bottega/bin/bottega ping` — it should say you are seen as `agent`.
2. Add the printed block to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`.
3. Codex asks you to trust the new hooks the first time they fire.

Re-run `npm run install:agent` after pulling a new version.

## 5. The watcher, the channel and the bar (ADR-0015)

The installer also:

- starts **the watcher** as a login service: `launchctl` on macOS
  (`~/Library/LaunchAgents/uk.co.effectivecode.bottega.watch.plist`, log in
  `~/.bottega/watch.log`), `systemctl --user` on Linux
  (`bottega-watch.service`). It queues your notes into idle Codex sessions
  and raises a notification when an agent is waiting for you.
- registers **the Claude Code channel** as the user-scoped MCP server
  `bottega`. Notes reach a Claude session only when it was started with the
  channels preview flag, so alias it:

  ```bash
  alias claude='claude --dangerously-load-development-channels server:bottega'
  ```

- copies the **widgets** to `~/.bottega/widgets/`. macOS: `brew install
--cask swiftbar`, then link `bottega.10s.sh` into SwiftBar's plugin folder.
  Omarchy: merge `waybar/config.jsonc` and `waybar/style.css` into
  `~/.config/waybar/` and add `custom/bottega` to a modules list.

`~/.bottega/bin/bottega status` prints the board for a shell;
`--swiftbar`, `--waybar` and `--json` are the other shapes.

## Local development

```bash
cp .dev.vars.example .dev.vars       # blank Access vars: every caller is local
npm run db:migrate:local
npm run dev                          # http://localhost:5173, Worker + local D1
```

Point a client at it with `BOTTEGA_URL=http://localhost:5173` (in
`~/.bottega/env` or the environment); no token is needed locally.
`npm run smoke:hooks` does exactly that on a spare port, unattended.

## Who can open it

Only identities allowed by the Access application: the owner's email (one
time PIN) and the machines' service tokens. The Worker re-verifies the JWT
on every API call and refuses agents on the board routes and the owner on
the agent routes; with no valid token the answer is 401.

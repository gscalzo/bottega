#!/usr/bin/env node
/**
 * Install the agent client on this machine (ADR-0010):
 *   1. bundle agent/ into one dependency-free file at ~/.bottega/bin/bottega.mjs
 *      (plus a `bottega` shell shim next to it)
 *   2. write ~/.bottega/env from the template if it does not exist
 *   3. link the skill into ~/.agents/skills/bottega, and from there into
 *      ~/.claude/skills and ~/.codex/skills when those directories exist
 *   4. register the hooks in ~/.claude/settings.json and ~/.codex/hooks.json
 *      (idempotent: entries are recognised by their command; a backup of
 *      each file is written once before its first change)
 *   5. print the standing-instruction block for the global CLAUDE.md /
 *      AGENTS.md — printed, never written: those files are yours.
 *
 * Flags: --home <dir> (default $HOME), --no-hooks (skip step 4).
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const HOME = flag('--home') ?? homedir();
const WITH_HOOKS = !args.includes('--no-hooks');
const DIR = path.join(HOME, '.bottega');
const BIN = path.join(DIR, 'bin');
const BUNDLE = path.join(BIN, 'bottega.mjs');

const ENV_TEMPLATE = `# Bottega agent client (ADR-0009, ADR-0010). Never commit this file.
# Where the board lives; point it at http://127.0.0.1:8787 for a local Worker.
BOTTEGA_URL=https://bottega.effectivecode.co.uk
# Cloudflare Access service token for this machine — see docs/DEPLOYMENT.md.
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
`;

const HOOK_EVENTS = [
  ['SessionStart', 10],
  ['UserPromptSubmit', 10],
  ['PostToolUse', 5],
  ['Stop', 10],
  ['SessionEnd', 3],
];

const INSTRUCTIONS = `## Bottega

Bottega (bottega.effectivecode.co.uk) is the owner's board of every running agent.
Hooks report your presence automatically; you speak through the bottega skill:
- At the start of a task: \`~/.bottega/bin/bottega task "<what you are doing>"\`.
- At a milestone: \`bottega done "<what landed>"\`; on the way: \`bottega progress "<note>"\`.
- Whenever you stop to ask the owner something: \`bottega question "<what you need>"\`.
- When Bottega itself falls short: \`bottega suggest "<idea>"\`.
Never post from a subagent. If Bottega is unreachable, carry on silently.
`;

function step(msg) {
  console.log(`• ${msg}`);
}

function bundle() {
  execFileSync('npm', ['run', '--silent', 'build:agent'], { cwd: ROOT, stdio: 'inherit' });
  mkdirSync(BIN, { recursive: true });
  copyFileSync(path.join(ROOT, 'dist', 'agent', 'bottega.mjs'), BUNDLE);
  const shim = path.join(BIN, 'bottega');
  writeFileSync(shim, `#!/bin/sh\nexec node "$(dirname "$0")/bottega.mjs" "$@"\n`);
  chmodSync(shim, 0o755);
  step(`client bundled to ${BUNDLE} (shim: ${shim})`);
}

function envFile() {
  const file = path.join(DIR, 'env');
  if (existsSync(file)) {
    step(`kept existing ${file}`);
    return;
  }
  writeFileSync(file, ENV_TEMPLATE);
  chmodSync(file, 0o600);
  step(`wrote ${file} — fill in the service token`);
}

function link(target, linkPath) {
  const parent = path.dirname(linkPath);
  if (!existsSync(parent)) return false;
  if (existsSync(linkPath) || isSymlink(linkPath)) {
    if (isSymlink(linkPath) && readlinkSync(linkPath) === target) return true;
    if (isSymlink(linkPath)) unlinkSync(linkPath);
    else {
      step(`skipped ${linkPath}: something that is not a symlink is already there`);
      return false;
    }
  }
  symlinkSync(target, linkPath);
  return true;
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function skill() {
  const source = path.join(ROOT, 'skills', 'bottega');
  const shared = path.join(HOME, '.agents', 'skills', 'bottega');
  mkdirSync(path.dirname(shared), { recursive: true });
  if (link(source, shared)) step(`skill linked at ${shared}`);
  for (const harness of ['.claude', '.codex']) {
    const linkPath = path.join(HOME, harness, 'skills', 'bottega');
    if (link(path.join('..', '..', '.agents', 'skills', 'bottega'), linkPath)) {
      step(`skill linked at ${linkPath}`);
    }
  }
}

function hookCommand(harness) {
  return `node "${BUNDLE}" hook ${harness}`;
}

function isOurs(entry, harness) {
  return (entry.hooks ?? []).some((h) => h.command === hookCommand(harness));
}

/** Adds one group per event unless an identical command is already registered. */
function mergeHooks(config, harness) {
  const hooks = (config.hooks ??= {});
  let changed = false;
  for (const [event, timeout] of HOOK_EVENTS) {
    const groups = (hooks[event] ??= []);
    if (groups.some((g) => isOurs(g, harness))) continue;
    groups.push({ hooks: [{ type: 'command', command: hookCommand(harness), timeout }] });
    changed = true;
  }
  return changed;
}

function registerHooks(file, harness) {
  if (!existsSync(path.dirname(file))) {
    step(`no ${path.dirname(file)} — skipped ${harness} hooks`);
    return;
  }
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (!mergeHooks(config, harness)) {
    step(`${harness} hooks already registered in ${file}`);
    return;
  }
  if (existsSync(file)) {
    const backup = `${file}.bak-bottega`;
    if (!existsSync(backup)) copyFileSync(file, backup);
  }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  step(`${harness} hooks registered in ${file}`);
}

bundle();
envFile();
skill();
if (WITH_HOOKS) {
  registerHooks(path.join(HOME, '.claude', 'settings.json'), 'claude');
  registerHooks(path.join(HOME, '.codex', 'hooks.json'), 'codex');
}
console.log(`
Done. Two things only you can do:

1. Put the machine's Access service token in ${path.join(DIR, 'env')}, then check:
     ${path.join(BIN, 'bottega')} ping
   (Codex asks you to trust the new hooks the first time they fire.)

2. Add this block to ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md:

${INSTRUCTIONS}`);

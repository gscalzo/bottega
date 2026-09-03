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
 *   5. install the watcher as a login service (launchd on macOS, a systemd
 *      user unit on Linux), register the Claude Code channel server with
 *      `claude mcp add`, and copy the menu bar / Waybar widgets (ADR-0015)
 *   6. print the standing-instruction block for the global CLAUDE.md /
 *      AGENTS.md — printed, never written: those files are yours.
 *
 * Flags: --home <dir> (default $HOME), --no-hooks (skip step 4),
 *        --no-services (skip the watcher service and the channel registration).
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
const WITH_SERVICES = !args.includes('--no-services');
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

function tryRun(cmd, cmdArgs) {
  try {
    return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** launchd and systemd start with a bare PATH; give the watcher the tools it calls. */
function servicePath() {
  const dirs = new Set(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']);
  for (const tool of ['codex', 'node']) {
    const found = tryRun('which', [tool]);
    if (found) dirs.add(path.dirname(found.trim()));
  }
  return [...dirs].join(':');
}

function launchdService() {
  const label = 'uk.co.effectivecode.bottega.watch';
  const plist = path.join(HOME, 'Library', 'LaunchAgents', `${label}.plist`);
  const log = path.join(DIR, 'watch.log');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>${process.execPath}</string><string>${BUNDLE}</string><string>watch</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${servicePath()}</string></dict>
</dict>
</plist>
`;
  mkdirSync(path.dirname(plist), { recursive: true });
  writeFileSync(plist, xml);
  const domain = `gui/${process.getuid()}`;
  tryRun('launchctl', ['bootout', domain, plist]);
  const ok = tryRun('launchctl', ['bootstrap', domain, plist]) !== null;
  step(
    ok
      ? `watcher running under launchd (${plist}, log ${log})`
      : `wrote ${plist}; load it with: launchctl bootstrap ${domain} ${plist}`,
  );
}

function systemdService() {
  const unit = path.join(HOME, '.config', 'systemd', 'user', 'bottega-watch.service');
  mkdirSync(path.dirname(unit), { recursive: true });
  writeFileSync(
    unit,
    `[Unit]
Description=Bottega watcher — wakes idle agents, notifies when one needs you
After=network-online.target

[Service]
ExecStart=${process.execPath} ${BUNDLE} watch
Restart=always
RestartSec=5
Environment=PATH=${servicePath()}

[Install]
WantedBy=default.target
`,
  );
  const ok =
    tryRun('systemctl', ['--user', 'daemon-reload']) !== null &&
    tryRun('systemctl', ['--user', 'enable', '--now', 'bottega-watch.service']) !== null;
  step(
    ok
      ? `watcher running under systemd (${unit})`
      : `wrote ${unit}; enable it with: systemctl --user enable --now bottega-watch`,
  );
}

function channelRegistration() {
  if (tryRun('which', ['claude']) === null) {
    step(
      'claude not on PATH — register the channel later with: claude mcp add --scope user bottega -- node ' +
        BUNDLE +
        ' channel',
    );
    return;
  }
  if (tryRun('claude', ['mcp', 'get', 'bottega']) !== null) {
    step('Claude Code channel already registered (claude mcp get bottega)');
    return;
  }
  const ok =
    tryRun('claude', [
      'mcp',
      'add',
      '--scope',
      'user',
      'bottega',
      '--',
      process.execPath,
      BUNDLE,
      'channel',
    ]) !== null;
  step(
    ok
      ? 'Claude Code channel registered as MCP server "bottega" (user scope)'
      : 'could not register the channel; run: claude mcp add --scope user bottega -- node ' +
          BUNDLE +
          ' channel',
  );
}

function widgets() {
  const dest = path.join(DIR, 'widgets');
  mkdirSync(path.join(dest, 'waybar'), { recursive: true });
  for (const file of ['bottega.10s.sh', 'waybar/config.jsonc', 'waybar/style.css']) {
    copyFileSync(path.join(ROOT, 'widgets', file), path.join(dest, file));
  }
  chmodSync(path.join(dest, 'bottega.10s.sh'), 0o755);
  step(`widgets copied to ${dest}`);
}

function services() {
  if (process.platform === 'darwin') launchdService();
  else if (process.platform === 'linux') systemdService();
  else
    step(
      `no watcher service for ${process.platform}; run "${path.join(BIN, 'bottega')} watch" yourself`,
    );
  channelRegistration();
  widgets();
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
if (WITH_SERVICES) services();
console.log(`
Done. What only you can do:

1. Put the machine's Access service token in ${path.join(DIR, 'env')}, then check:
     ${path.join(BIN, 'bottega')} ping
   (Codex asks you to trust the new hooks the first time they fire.)

2. Add this block to ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md:

${INSTRUCTIONS}
3. Start Claude Code with the channel so the owner's notes can wake it (ADR-0015):
     claude --dangerously-load-development-channels server:bottega
   (an alias in your shell profile; the flag is what the channels preview requires)

4. Menu bar (macOS): brew install --cask swiftbar, then link ${path.join(DIR, 'widgets', 'bottega.10s.sh')}
   into SwiftBar's plugin folder. Waybar (Omarchy): merge ${path.join(DIR, 'widgets', 'waybar', 'config.jsonc')}
   and style.css into ~/.config/waybar/.`);

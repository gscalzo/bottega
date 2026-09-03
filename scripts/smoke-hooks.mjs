#!/usr/bin/env node
/**
 * End-to-end smoke test of the hook path (ADR-0012): the bundled client is
 * fed recorded harness payloads against a local Worker with a local D1, and
 * the board must then show the agent with the right state and task.
 *
 * Runs `vite dev` on a spare port for the duration; needs nothing else.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8790);
const URL_BASE = `http://127.0.0.1:${PORT}`;
const BUNDLE = path.join(ROOT, 'dist', 'agent', 'bottega.mjs');
const SESSION = `smoke-${Date.now().toString(36)}`;
const HOME = mkdtempSync(path.join(tmpdir(), 'bottega-smoke-'));

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], ...opts });

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
}

function hook(payload) {
  const res = spawnSync('node', [BUNDLE, 'hook', 'claude'], {
    cwd: ROOT,
    input: JSON.stringify({ session_id: SESSION, cwd: ROOT, ...payload }),
    encoding: 'utf8',
    env: { ...process.env, BOTTEGA_HOME: HOME, BOTTEGA_URL: URL_BASE, CLAUDE_ENV_FILE: '' },
  });
  if (res.status !== 0) fail(`hook ${payload.hook_event_name} exited ${res.status}`);
  return res.stdout;
}

function cli(args) {
  const res = spawnSync('node', [BUNDLE, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, BOTTEGA_HOME: HOME, BOTTEGA_URL: URL_BASE, BOTTEGA_SESSION_ID: SESSION },
  });
  if (res.status !== 0) fail(`cli ${args.join(' ')} exited ${res.status}: ${res.stderr}`);
  return res.stdout;
}

async function waitForServer(deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${URL_BASE}/api/ping`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no server on ${URL_BASE} after ${deadlineMs} ms`);
}

// Without .dev.vars the Access vars from wrangler.jsonc apply and every call is
// a 401 (CI has no .dev.vars; it is git-ignored). Blank them for the run.
const DEV_VARS = path.join(ROOT, '.dev.vars');
const ownsDevVars = !existsSync(DEV_VARS);
if (ownsDevVars) copyFileSync(path.join(ROOT, '.dev.vars.example'), DEV_VARS);

console.log('• bundling the client');
run('npm', ['run', '--silent', 'build:agent']);
console.log('• applying migrations to the local D1');
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'bottega', '--local'], { stdio: 'ignore' });
console.log(`• starting vite dev on ${PORT}`);
const server = spawn(
  'npx',
  ['vite', 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  },
);

try {
  await waitForServer(60_000);

  const intro = hook({ hook_event_name: 'SessionStart', source: 'startup', model: 'smoke-model' });
  if (!intro.includes(`you are "claude · bottega · smok"`))
    fail(`unexpected SessionStart output: ${intro}`);
  hook({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Smoke test: check that the hook path works',
  });
  cli(['task', 'Smoke testing the hook path']);
  cli(['question', 'Does the board show me waiting?']);
  hook({ hook_event_name: 'Stop', last_assistant_message: 'Smoke run complete.' });

  const board = await (await fetch(`${URL_BASE}/api/board`)).json();
  const room = board.rooms.find((r) => r.id === 'bottega');
  const agent = room?.agents.find((a) => a.id === SESSION);
  if (!agent) fail('the agent is not on the board');
  else {
    const expect = (label, actual, wanted) => {
      if (actual !== wanted)
        fail(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
    };
    expect('state', agent.state, 'waiting');
    expect('task', agent.task, 'Smoke testing the hook path');
    expect('taskSource', agent.taskSource, 'agent');
    expect('lastReport', agent.lastReport, 'Smoke run complete.');
    expect('model', agent.model, 'smoke-model');
  }
  hook({ hook_event_name: 'SessionEnd' });
  const after = await (await fetch(`${URL_BASE}/api/agents/${SESSION}`)).json();
  if (after.agent?.state !== 'gone') fail(`after SessionEnd the state is ${after.agent?.state}`);
  if (after.messages?.length !== 2) fail(`expected 2 messages, found ${after.messages?.length}`);
} catch (err) {
  fail(String(err));
} finally {
  process.kill(-server.pid, 'SIGTERM');
  rmSync(HOME, { recursive: true, force: true });
  if (ownsDevVars) rmSync(DEV_VARS, { force: true });
}

console.log(process.exitCode ? 'smoke: FAILED' : '✓ smoke: the hook path works end to end');

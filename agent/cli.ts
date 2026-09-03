/**
 * `bottega <command>` — the skill's verbs (ADR-0003) plus the hook entry
 * and two diagnostics. Exit codes: 0 ok, 1 the server said no, 2 usage.
 */
import { MESSAGE_MAX_CHARS } from '../shared/rules';
import type { AgentMessageKind, AgentPostReq, AgentPostRes, PingRes } from '../shared/types';
import { ApiError, call } from './api';
import { runChannel } from './channel';
import { loadConfig } from './config';
import { runHook } from './hook';
import type { Io } from './io';
import { resolveSessionId } from './session';
import { fetchBoard, plain, swiftBar, waybar } from './status';
import { runWatch } from './watch';

const KINDS: ReadonlySet<string> = new Set(['task', 'progress', 'done', 'question', 'suggest']);
const POST_TIMEOUT_MS = 8000;
const DEFAULT_INTERVAL_S = 5;
const SESSION_TIMEOUT_MS = 120_000;

export const USAGE = `bottega — report to the owner's agent board

  bottega task "<what I am doing now>"      set the task line on my card
  bottega progress "<note>"                 a progress note
  bottega done "<milestone>"                a milestone reached
  bottega question "<what I need>"          I am waiting on the owner (state: waiting)
  bottega suggest "<idea>"                  an idea for Bottega itself
  bottega ping                              check the connection and the credentials
  bottega whoami                            the session id and URL this command would use
  bottega status [--json|--swiftbar|--waybar]  the board, for a shell, a menu bar or Waybar
  bottega watch [--interval <s>] [--once]   the machine's watcher: notifications, Codex queue
  bottega channel                           Claude Code channel server (started by the session)
  bottega hook [claude|codex]               harness hook entry (stdin: hook JSON)

Options: --session <id>   the harness session id, when BOTTEGA_SESSION_ID /
                          CLAUDE_CODE_SESSION_ID are unset and no marker exists
`;

export interface ParsedArgs {
  command: string;
  text: string;
  session: string | undefined;
  interval: string | undefined;
  flags: Set<string>;
}

const VALUED = new Set(['--session', '--interval']);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const rest: string[] = [];
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  let pending: string | null = null;
  for (const arg of argv) {
    if (pending !== null) {
      values[pending] = arg;
      pending = null;
    } else if (VALUED.has(arg)) pending = arg;
    else if (arg.startsWith('--')) flags.add(arg.slice(2));
    else rest.push(arg);
  }
  const [command = 'help', ...words] = rest;
  return {
    command,
    text: words.join(' ').trim(),
    session: values['--session'],
    interval: values['--interval'],
    flags,
  };
}

async function post(io: Io, kind: AgentMessageKind, text: string, session: string | undefined) {
  if (text === '') return usage(io, `${kind} needs a text`);
  if (text.length > MESSAGE_MAX_CHARS) return usage(io, `text longer than ${MESSAGE_MAX_CHARS}`);
  const sessionId = resolveSessionId(io, session);
  if (!sessionId) return usage(io, 'no session id: pass --session <id>');
  const body: AgentPostReq = { sessionId, kind, body: text };
  const res = await call<AgentPostRes>(io, loadConfig(io), {
    method: 'POST',
    path: '/api/agent/messages',
    body,
    timeoutMs: POST_TIMEOUT_MS,
  });
  io.stdout(`bottega: ${kind} posted as ${res.agent.name} (state ${res.agent.state})\n`);
  return 0;
}

async function ping(io: Io) {
  const config = loadConfig(io);
  const res = await call<PingRes>(io, config, {
    method: 'GET',
    path: '/api/ping',
    timeoutMs: POST_TIMEOUT_MS,
  });
  io.stdout(`bottega: ${config.url} answers; you are seen as "${res.caller}"\n`);
  return 0;
}

function whoami(io: Io, session: string | undefined) {
  const id = resolveSessionId(io, session) ?? '(unknown — pass --session)';
  io.stdout(`session ${id}\nurl ${loadConfig(io).url}\n`);
  return 0;
}

function usage(io: Io, problem?: string): 2 {
  if (problem) io.stderr(`bottega: ${problem}\n\n`);
  io.stderr(USAGE);
  return 2;
}

async function status(io: Io, flags: Set<string>) {
  const config = loadConfig(io);
  const board = await fetchBoard(io, config);
  if (flags.has('json')) io.stdout(`${JSON.stringify(board)}\n`);
  else if (flags.has('swiftbar')) io.stdout(swiftBar(board, config.url));
  else if (flags.has('waybar')) io.stdout(waybar(board, config.url));
  else io.stdout(plain(board));
  return 0;
}

function intervalMs(args: ParsedArgs): number | null {
  const seconds = args.interval === undefined ? DEFAULT_INTERVAL_S : Number(args.interval);
  return Number.isFinite(seconds) && seconds >= 1 ? seconds * 1000 : null;
}

async function dispatch(io: Io, args: ParsedArgs, readStdin: () => Promise<string>) {
  const { command, text, session, flags } = args;
  if (command === 'hook') return runHook(io, text, await readStdin());
  if (KINDS.has(command)) return post(io, command as AgentMessageKind, text, session);
  if (command === 'ping') return ping(io);
  if (command === 'whoami') return whoami(io, session);
  if (command === 'status') return status(io, flags);
  if (command === 'watch' || command === 'channel') return daemon(io, args);
  if (command === 'help') return usage(io);
  return usage(io, `unknown command "${command}"`);
}

async function daemon(io: Io, args: ParsedArgs) {
  const ms = intervalMs(args);
  if (ms === null) return usage(io, '--interval must be a number of seconds, at least 1');
  const passes = args.flags.has('once') ? 1 : undefined;
  if (args.command === 'watch') return runWatch(io, loadConfig(io), { intervalMs: ms, passes });
  return runChannel(io, loadConfig(io), {
    intervalMs: ms,
    sessionTimeoutMs: SESSION_TIMEOUT_MS,
    passes,
  });
}

export async function run(
  argv: readonly string[],
  readStdin: () => Promise<string>,
  io: Io,
): Promise<number> {
  try {
    return await dispatch(io, parseArgs(argv), readStdin);
  } catch (err) {
    const reason = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
    io.stderr(`bottega: ${reason}\n`);
    return 1;
  }
}

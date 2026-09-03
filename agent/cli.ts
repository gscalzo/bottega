/**
 * `bottega <command>` — the skill's verbs (ADR-0003) plus the hook entry
 * and two diagnostics. Exit codes: 0 ok, 1 the server said no, 2 usage.
 */
import { MESSAGE_MAX_CHARS } from '../shared/rules';
import type { AgentMessageKind, AgentPostReq, AgentPostRes, PingRes } from '../shared/types';
import { ApiError, call } from './api';
import { loadConfig } from './config';
import { runHook } from './hook';
import type { Io } from './io';
import { resolveSessionId } from './session';

const KINDS: ReadonlySet<string> = new Set(['task', 'progress', 'done', 'question', 'suggest']);
const POST_TIMEOUT_MS = 8000;

export const USAGE = `bottega — report to the owner's agent board

  bottega task "<what I am doing now>"      set the task line on my card
  bottega progress "<note>"                 a progress note
  bottega done "<milestone>"                a milestone reached
  bottega question "<what I need>"          I am waiting on the owner (state: waiting)
  bottega suggest "<idea>"                  an idea for Bottega itself
  bottega ping                              check the connection and the credentials
  bottega whoami                            the session id and URL this command would use
  bottega hook [claude|codex]               harness hook entry (stdin: hook JSON)

Options: --session <id>   the harness session id, when BOTTEGA_SESSION_ID /
                          CLAUDE_CODE_SESSION_ID are unset and no marker exists
`;

export interface ParsedArgs {
  command: string;
  text: string;
  session: string | undefined;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const rest: string[] = [];
  let session: string | undefined;
  let takeSession = false;
  for (const arg of argv) {
    if (takeSession) {
      session = arg;
      takeSession = false;
    } else if (arg === '--session') takeSession = true;
    else rest.push(arg);
  }
  const [command = 'help', ...words] = rest;
  return { command, text: words.join(' ').trim(), session };
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

async function dispatch(io: Io, args: ParsedArgs, readStdin: () => Promise<string>) {
  const { command, text, session } = args;
  if (command === 'hook') return runHook(io, text, await readStdin());
  if (KINDS.has(command)) return post(io, command as AgentMessageKind, text, session);
  if (command === 'ping') return ping(io);
  if (command === 'whoami') return whoami(io, session);
  if (command === 'help') return usage(io);
  return usage(io, `unknown command "${command}"`);
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

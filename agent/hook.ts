/**
 * The hook (ADR-0003): stdin carries the harness's JSON; we translate it to
 * one Bottega event, send it, and print what the agent should know. Every
 * failure is swallowed — Bottega being down must never slow or block an
 * agent — and the exit code is always 0.
 */
import { HEARTBEAT_EVERY_MS } from '../shared/rules';
import type {
  AgentEventReq,
  AgentEventRes,
  DeliveredMessage,
  Harness,
  HookEvent,
} from '../shared/types';
import { call } from './api';
import { loadConfig } from './config';
import type { Io } from './io';
import { heartbeatPath, markerPath, repoSlugFor } from './session';

export interface HookInput {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  agent_id?: string;
  prompt?: string;
  last_assistant_message?: string;
  model?: string;
  source?: string;
}

export const CLI_HINT = '~/.bottega/bin/bottega';

const TIMEOUT_MS: Record<HookEvent, number> = {
  session_start: 4000,
  prompt: 4000,
  heartbeat: 3000,
  stop: 4000,
  session_end: 2000,
};

export function parseHookInput(text: string): HookInput | null {
  try {
    const value: unknown = JSON.parse(text);
    // Stryker disable next-line ConditionalExpression: a null value returned as the input still reads as "nothing to do"
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Which Bottega event a harness event is. A SessionStart after compaction
 * is not a new session: the agent is mid-work, so it counts as a prompt
 * (working, messages delivered) while still re-telling the agent who it is.
 */
export function hookEventFor(input: HookInput): HookEvent | null {
  switch (input.hook_event_name) {
    case 'SessionStart':
      return input.source === 'compact' ? 'prompt' : 'session_start';
    case 'UserPromptSubmit':
      return 'prompt';
    case 'PostToolUse':
      return 'heartbeat';
    case 'Stop':
      return 'stop';
    case 'SessionEnd':
      return 'session_end';
    default:
      return null;
  }
}

export function excerptFor(event: HookEvent, input: HookInput): string | null {
  if (event === 'prompt') return input.prompt ?? null;
  if (event === 'stop') return input.last_assistant_message ?? null;
  return null;
}

/** A working agent proves it is alive at most once per HEARTBEAT_EVERY_MS. */
export function heartbeatDue(io: Io, path: string, now: number): boolean {
  const last = Number(io.readFile(path) ?? 0);
  return now - last >= HEARTBEAT_EVERY_MS;
}

function stamp(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function messageLines(messages: readonly DeliveredMessage[]): string {
  return messages.map((m) => `- [${stamp(m.at)} · ${m.scope}] ${m.body}`).join('\n');
}

/** What the harness adds to the agent's context (ADR-0007). */
export function formatInjection(input: HookInput, res: AgentEventRes): string {
  const n = res.messages.length;
  const waiting =
    n === 0 ? 'No messages waiting.' : `${n} message${n === 1 ? '' : 's'} from the owner:`;
  const body = n === 0 ? '' : `\n${messageLines(res.messages)}`;
  if (input.hook_event_name === 'SessionStart') {
    return (
      `Bottega: you are "${res.agent.name}" (session ${res.agent.id}). Report with the bottega ` +
      `skill — \`${CLI_HINT} task|progress|done|question|suggest "<text>"\` (add ` +
      `--session ${res.agent.id} if BOTTEGA_SESSION_ID is unset). ${waiting}${body}\n`
    );
  }
  return n === 0 ? '' : `Bottega: ${waiting}${body}\n`;
}

function harnessFor(io: Io, argument: string): Harness {
  if (argument === 'claude' || argument === 'codex') return argument;
  return io.env.CLAUDECODE ? 'claude' : 'codex';
}

interface Plan {
  req: AgentEventReq;
  input: HookInput;
  sessionId: string;
  cwd: string;
}

/** Everything decided before any network: null means "nothing to send". */
export function planHook(io: Io, harnessArg: string, stdin: string): Plan | null {
  const input = parseHookInput(stdin);
  if (!input || input.agent_id || !input.session_id) return null;
  const event = hookEventFor(input);
  if (!event) return null;
  const cwd = input.cwd ?? io.cwd();
  if (event === 'heartbeat' && !heartbeatDue(io, heartbeatPath(io, input.session_id), io.now())) {
    return null;
  }
  const req: AgentEventReq = {
    event,
    session: {
      id: input.session_id,
      harness: harnessFor(io, harnessArg),
      host: io.hostname(),
      cwd,
      repo: repoSlugFor(io, cwd),
      model: input.model ?? null,
    },
    excerpt: excerptFor(event, input),
  };
  return { req, input, sessionId: input.session_id, cwd };
}

/** Local bookkeeping: markers for the skill CLI, the heartbeat stamp. */
export function recordLocally(io: Io, plan: Plan): void {
  const { event } = plan.req;
  if (event === 'session_start') {
    io.writeFile(markerPath(io, plan.cwd), `${plan.sessionId}\n`);
    if (io.env.CLAUDE_ENV_FILE) {
      io.appendFile(io.env.CLAUDE_ENV_FILE, `export BOTTEGA_SESSION_ID=${plan.sessionId}\n`);
    }
  } else if (event === 'heartbeat') {
    io.writeFile(heartbeatPath(io, plan.sessionId), `${io.now()}\n`);
  } else if (event === 'session_end') {
    const marker = markerPath(io, plan.cwd);
    if (io.readFile(marker)?.trim() === plan.sessionId) io.deleteFile(marker);
    io.deleteFile(heartbeatPath(io, plan.sessionId));
  }
}

export async function runHook(io: Io, harnessArg: string, stdin: string): Promise<0> {
  try {
    const plan = planHook(io, harnessArg, stdin);
    // Stryker disable next-line ConditionalExpression: without the guard recordLocally throws on null and the catch below is just as silent
    if (!plan) return 0;
    recordLocally(io, plan);
    const res = await call<AgentEventRes>(io, loadConfig(io), {
      method: 'POST',
      path: '/api/agent/events',
      body: plan.req,
      timeoutMs: TIMEOUT_MS[plan.req.event],
    });
    const injects = plan.req.event === 'session_start' || plan.req.event === 'prompt';
    if (injects) io.stdout(formatInjection(plan.input, res));
  } catch {
    // Silent by design (ADR-0010): the hook never slows or blocks an agent.
  }
  return 0;
}

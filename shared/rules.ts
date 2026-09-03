/**
 * The pure rules the Worker enforces and the client relies on (ADR-0004,
 * ADR-0005, ADR-0006). No I/O, no clock: callers pass `now`.
 */
import type {
  AgentRow,
  AgentState,
  AgentView,
  BoardCounts,
  EffectiveState,
  HookEvent,
} from './types';
import type { TaskSource } from './types';

/** An agent silent for longer than this is shown as stale (ADR-0005). */
export const STALE_AFTER_MS = 30 * 60 * 1000;
/** A working agent proves it is alive at most this often (ADR-0005). */
export const HEARTBEAT_EVERY_MS = 5 * 60 * 1000;
export const PROMPT_EXCERPT_MAX = 200;
export const REPORT_EXCERPT_MAX = 300;
/** A prompt shorter than this never replaces the task line (ADR-0006). */
export const TASK_MIN_PROMPT_CHARS = 20;
/** At most this many undelivered messages are injected per prompt (ADR-0007). */
export const INJECTION_LIMIT = 10;
export const MESSAGE_MAX_CHARS = 4000;
/** Agents seen within this window are on the board's home page. */
export const BOARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export const FIXED_ROOMS = ['lobby', 'suggestions'] as const;

/** Room slug from a repository or directory name (ADR-0004). */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === '' ? 'lobby' : slug;
}

/** Whitespace-collapsed, length-capped excerpt; an ellipsis marks the cut. */
export function excerpt(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/** State machine of ADR-0005. `current` is undefined for an agent never seen. */
export function nextState(current: AgentState | undefined, event: HookEvent): AgentState {
  switch (event) {
    case 'session_start':
      return 'online';
    case 'prompt':
      return 'working';
    case 'stop':
      return current === 'waiting' ? 'waiting' : 'idle';
    case 'session_end':
      return 'gone';
    case 'heartbeat':
      return current ?? 'online';
  }
}

export interface TaskLine {
  task: string | null;
  source: TaskSource | null;
}

/**
 * Whether a prompt excerpt replaces the task line (ADR-0006): only a
 * meaningful prompt does, and never one set explicitly by the agent.
 */
export function taskFromPrompt(current: TaskLine, promptExcerpt: string): TaskLine | null {
  if (current.source === 'agent') return null;
  if (promptExcerpt.length < TASK_MIN_PROMPT_CHARS) return null;
  return { task: promptExcerpt, source: 'prompt' };
}

export function effectiveState(
  row: Pick<AgentRow, 'state' | 'last_seen'>,
  now: number,
): EffectiveState {
  if (row.state === 'gone') return 'gone';
  return now - row.last_seen > STALE_AFTER_MS ? 'stale' : row.state;
}

/** "Active" on the board is working, waiting or idle and not stale (ADR-0005). */
export function isActive(state: EffectiveState): boolean {
  return state !== 'gone' && state !== 'stale';
}

export function countStates(agents: readonly AgentView[]): BoardCounts {
  const counts: BoardCounts = { working: 0, waiting: 0, idle: 0, stale: 0 };
  for (const agent of agents) {
    if (agent.state === 'working') counts.working += 1;
    else if (agent.state === 'waiting') counts.waiting += 1;
    else if (agent.state === 'idle' || agent.state === 'online') counts.idle += 1;
    else if (agent.state === 'stale') counts.stale += 1;
  }
  return counts;
}

/** "claude · raffaello · 7f3a" (ADR-0004). */
export function deriveName(harness: string, repo: string, sessionId: string): string {
  return `${harness} · ${repo} · ${sessionId.slice(0, 4)}`;
}

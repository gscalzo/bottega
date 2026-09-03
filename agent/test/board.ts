/** A small board fixture for the status, watch and channel tests. */
import type { AgentView, BoardRes, PendingMessage } from '../../shared/types';

export const NOW = new Date(2026, 8, 3, 10, 41).getTime();

export const agent = (over: Partial<AgentView>): AgentView => ({
  id: 'abcd-1',
  harness: 'claude',
  roomId: 'raffaello',
  name: 'claude · raffaello · abcd',
  host: 'macbook',
  cwd: '/w',
  model: null,
  state: 'working',
  stateSince: NOW - 3 * 60_000,
  task: 'Fix the build',
  taskSource: 'prompt',
  lastReport: null,
  firstSeen: NOW - 600_000,
  lastSeen: NOW,
  ...over,
});

export const board = (agents: AgentView[], counts?: BoardRes['counts']): BoardRes => ({
  now: NOW,
  counts: counts ?? {
    working: agents.filter((a) => a.state === 'working').length,
    waiting: agents.filter((a) => a.state === 'waiting').length,
    idle: agents.filter((a) => a.state === 'idle' || a.state === 'online').length,
    stale: agents.filter((a) => a.state === 'stale').length,
  },
  rooms: [
    {
      id: 'raffaello',
      kind: 'repo',
      agents: agents.filter((a) => a.roomId === 'raffaello'),
      lastActivity: NOW,
    },
    {
      id: 'lobby',
      kind: 'fixed',
      agents: agents.filter((a) => a.roomId === 'lobby'),
      lastActivity: null,
    },
  ],
  openSuggestions: 0,
});

export const pending = (
  over: Partial<PendingMessage> & { harness?: 'claude' | 'codex' },
): PendingMessage => ({
  id: 7,
  at: NOW - 60_000,
  body: 'run the gate',
  scope: 'direct',
  agent: {
    id: over.harness === 'codex' ? 'cdx-1' : 'abcd-1',
    harness: over.harness ?? 'claude',
    roomId: 'raffaello',
    name: over.harness === 'codex' ? 'codex · raffaello · cdx-' : 'claude · raffaello · abcd',
  },
  ...over,
});

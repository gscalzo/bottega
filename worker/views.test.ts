import { describe, expect, it } from 'vitest';
import type { AgentRow, AgentView, RoomView } from '../shared/types';
import type { MessageRow, RoomRow } from './db';
import { buildBoard, compareAgents, compareRooms, messageViews } from './views';

const now = 1_700_000_000_000;
const row = (id: string, state: AgentRow['state'], lastSeen: number, roomId = 'r'): AgentRow => ({
  id,
  harness: 'claude',
  room_id: roomId,
  name: id,
  host: 'h',
  cwd: '/',
  model: null,
  state,
  state_since: lastSeen,
  task: null,
  task_source: null,
  last_report: null,
  first_seen: lastSeen,
  last_seen: lastSeen,
});
const view = (id: string, state: AgentView['state'], lastSeen: number): AgentView =>
  ({ id, state, lastSeen }) as unknown as AgentView;
const roomView = (id: string, agents: AgentView[], lastActivity: number | null): RoomView => ({
  id,
  kind: 'repo',
  agents,
  lastActivity,
});

describe('compareAgents', () => {
  it('ranks by attention, then most recently seen', () => {
    const sorted = [
      view('gone', 'gone', 9),
      view('idle', 'idle', 1),
      view('stale', 'stale', 9),
      view('working-old', 'working', 1),
      view('online', 'online', 9),
      view('working-new', 'working', 2),
      view('waiting', 'waiting', 0),
    ].sort(compareAgents);
    expect(sorted.map((a) => a.id)).toEqual([
      'waiting',
      'working-new',
      'working-old',
      'idle',
      'online',
      'stale',
      'gone',
    ]);
  });
});

describe('compareRooms', () => {
  it('ranks by active agents, then activity, then name', () => {
    const sorted = [
      roomView('b', [], 5),
      roomView('a', [], 5),
      roomView('quiet', [view('x', 'stale', 1)], 9),
      roomView('busy', [view('y', 'idle', 1)], 1),
      roomView('none', [], null),
      roomView('late', [], 7),
      roomView('early', [], 3),
    ].sort(compareRooms);
    expect(sorted.map((r) => r.id)).toEqual(['busy', 'quiet', 'late', 'a', 'b', 'early', 'none']);
  });
});

describe('buildBoard', () => {
  const rooms: RoomRow[] = [
    { id: 'r', kind: 'repo', created_at: 0 },
    { id: 'lobby', kind: 'fixed', created_at: 0 },
  ];
  it('drops agents outside the window and computes room activity', () => {
    const agents = [
      row('recent', 'idle', now - 1000),
      row('ancient', 'idle', now - 25 * 60 * 60 * 1000),
      row('edge', 'idle', now - 24 * 60 * 60 * 1000),
    ];
    const b = buildBoard(rooms, agents, new Map([['r', now - 500]]), now, 2);
    expect(b.now).toBe(now);
    expect(b.openSuggestions).toBe(2);
    expect(b.counts).toEqual({ working: 0, waiting: 0, idle: 1, stale: 1 });
    expect(b.rooms[0]).toMatchObject({
      id: 'r',
      agents: [{ id: 'recent' }, { id: 'edge' }],
      lastActivity: now - 500,
    });
    expect(b.rooms[1]).toEqual({ id: 'lobby', kind: 'fixed', agents: [], lastActivity: null });
  });
  it('takes the latest of agent and message activity', () => {
    const only = buildBoard(rooms, [row('a', 'idle', now - 10)], new Map(), now, 0);
    expect(only.rooms[0]?.lastActivity).toBe(now - 10);
    const msg = buildBoard(rooms, [], new Map([['lobby', now - 3]]), now, 0);
    expect(msg.rooms[0]).toMatchObject({ id: 'lobby', lastActivity: now - 3 });
    const both = buildBoard(
      rooms,
      [row('a', 'idle', now - 10)],
      new Map([['r', now - 20]]),
      now,
      0,
    );
    expect(both.rooms[0]?.lastActivity).toBe(now - 10);
  });
});

describe('messageViews', () => {
  const base: MessageRow = {
    id: 1,
    at: 5,
    room_id: 'r',
    agent_id: null,
    to_agent_id: null,
    kind: 'owner',
    body: 'note',
    handled: 0,
    author_name: null,
  };
  it('reads the author from the joined name, falling back to the id', () => {
    const [owner, named, nameless] = messageViews(
      [
        base,
        { ...base, id: 2, agent_id: 'a1', author_name: 'claude · r · a1', kind: 'done' },
        { ...base, id: 3, agent_id: 'a2', author_name: null, kind: 'progress', handled: 1 },
      ],
      [{ message_id: 1, agent_id: 'a1', agent_name: 'claude · r · a1', at: 9, via: 'queue' }],
    );
    expect(owner).toMatchObject({
      author: { type: 'owner' },
      handled: false,
      deliveredTo: [{ agentId: 'a1', agentName: 'claude · r · a1', at: 9, via: 'queue' }],
    });
    expect(named).toMatchObject({
      author: { type: 'agent', id: 'a1', name: 'claude · r · a1' },
      deliveredTo: [],
    });
    expect(nameless).toMatchObject({
      author: { type: 'agent', id: 'a2', name: 'a2' },
      handled: true,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { BOARD_WINDOW_MS, STALE_AFTER_MS } from '../shared/rules';
import type { AgentRes, BoardRes, MessageView, RoomRes } from '../shared/types';
import { createTestApp, event, session } from './test/harness';
import type { TestApp } from './test/harness';

const MIN = 60_000;
const start = (t: TestApp, id: string, repo: string) =>
  t.call('POST', '/api/agent/events', { event: 'session_start', session: session(id, repo) });
const board = async (t: TestApp) => (await t.call('GET', '/api/board')).json<BoardRes>();
const room = async (t: TestApp, id: string) => {
  const res = await t.call('GET', `/api/rooms/${id}`);
  expect(res.status).toBe(200);
  return res.json<RoomRes>();
};

describe('GET /api/board', () => {
  it('starts with the two fixed rooms and zero counts', async () => {
    const t = createTestApp();
    expect(await board(t)).toEqual({
      now: t.clock.now,
      counts: { working: 0, waiting: 0, idle: 0, stale: 0 },
      rooms: [
        { id: 'lobby', kind: 'fixed', agents: [], lastActivity: null },
        { id: 'suggestions', kind: 'fixed', agents: [], lastActivity: null },
      ],
      openSuggestions: 0,
    });
  });

  it('counts states, orders rooms by activity and agents by attention', async () => {
    const t = createTestApp();
    await start(t, 'old', 'archive');
    t.clock.now += BOARD_WINDOW_MS + 1;
    await start(t, 'stale1', 'raffaello');
    await event(t, 'prompt', 'stale1');
    t.clock.now += STALE_AFTER_MS + 1;
    await start(t, 'idle1', 'raffaello');
    await event(t, 'prompt', 'idle1');
    await event(t, 'stop', 'idle1');
    await start(t, 'w1', 'raffaello');
    await event(t, 'prompt', 'w1');
    await start(t, 'q1', 'intonato');
    await t.call('POST', '/api/agent/messages', { sessionId: 'q1', kind: 'question', body: '?' });
    await start(t, 'gone1', 'intonato');
    await event(t, 'session_end', 'gone1', { repo: 'intonato' });
    t.clock.now += MIN;
    await start(t, 'fresh', 'bottega');
    const b = await board(t);
    expect(b.counts).toEqual({ working: 1, waiting: 1, idle: 2, stale: 1 });
    expect(b.rooms.map((r) => [r.id, r.agents.map((a) => `${a.id}:${a.state}`)])).toEqual([
      ['raffaello', ['w1:working', 'idle1:idle', 'stale1:stale']],
      ['bottega', ['fresh:online']],
      ['intonato', ['q1:waiting', 'gone1:gone']],
      ['archive', []],
      ['lobby', []],
      ['suggestions', []],
    ]);
    expect(b.rooms[1]?.lastActivity).toBe(t.clock.now);
    expect(b.rooms[3]?.lastActivity).toBeNull();
  });

  it('orders equally busy rooms by activity then name', async () => {
    const t = createTestApp();
    await start(t, 'a', 'zeta');
    t.clock.now += MIN;
    await start(t, 'b', 'alpha');
    await t.call('POST', '/api/messages', { roomId: 'suggestions', body: 'note' });
    t.clock.now += MIN;
    await start(t, 'c', 'mid');
    await event(t, 'session_end', 'c', { repo: 'mid' });
    const ids = (await board(t)).rooms.map((r) => r.id);
    expect(ids).toEqual(['alpha', 'zeta', 'mid', 'suggestions', 'lobby']);
  });
});

describe('GET /api/rooms/:id', () => {
  it('404s an unknown room', async () => {
    const t = createTestApp();
    const res = await t.call('GET', '/api/rooms/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'room not found' });
  });

  it('lists the room agents and its messages, newest first, with deliveries', async () => {
    const t = createTestApp();
    await start(t, 'a1', 'raffaello');
    await start(t, 'b1', 'raffaello');
    await start(t, 'x1', 'other');
    t.clock.now += MIN;
    await t.call('POST', '/api/messages', { roomId: 'raffaello', body: 'all hands' });
    await t.call('POST', '/api/messages', { toAgentId: 'a1', body: 'just you' });
    await t.call('POST', '/api/agent/messages', { sessionId: 'b1', kind: 'progress', body: 'ok' });
    await t.call('POST', '/api/agent/messages', { sessionId: 'b1', kind: 'question', body: '?' });
    t.clock.now += MIN;
    await event(t, 'prompt', 'a1');
    const r = await room(t, 'raffaello');
    expect(r.room).toEqual({ id: 'raffaello', kind: 'repo' });
    expect(r.agents.map((a) => [a.id, a.state])).toEqual([
      ['b1', 'waiting'],
      ['a1', 'working'],
    ]);
    expect(r.agents[1]).toMatchObject({ roomId: 'raffaello', lastSeen: t.clock.now });
    expect(r.messages.map((m) => [m.id, m.kind, m.body])).toEqual([
      [4, 'question', '?'],
      [3, 'progress', 'ok'],
      [2, 'owner', 'just you'],
      [1, 'owner', 'all hands'],
    ]);
    expect(r.messages[3]).toEqual({
      id: 1,
      at: t.clock.now - MIN,
      roomId: 'raffaello',
      kind: 'owner',
      body: 'all hands',
      author: { type: 'owner' },
      toAgentId: null,
      handled: false,
      deliveredTo: [{ agentId: 'a1', agentName: 'claude · raffaello · a1', at: t.clock.now }],
    });
    expect(r.messages[2]?.toAgentId).toBe('a1');
    expect(r.messages[1]?.author).toEqual({
      type: 'agent',
      id: 'b1',
      name: 'claude · raffaello · b1',
    });
    expect(r.messages[1]?.deliveredTo).toEqual([]);
    expect((await room(t, 'other')).agents.map((a) => a.id)).toEqual(['x1']);
  });
});

describe('GET /api/agents/:id', () => {
  it('404s an unknown agent', async () => {
    const t = createTestApp();
    const res = await t.call('GET', '/api/agents/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'agent not found' });
  });

  it('returns the card, the timeline and the messages by or for the agent', async () => {
    const t = createTestApp();
    await start(t, 'a1', 'raffaello');
    await start(t, 'b1', 'raffaello');
    t.clock.now += MIN;
    await event(t, 'prompt', 'a1', { excerpt: 'fix the flaky test in the payment module' });
    await t.call('POST', '/api/messages', { toAgentId: 'a1', body: 'for a1' });
    await t.call('POST', '/api/messages', { toAgentId: 'b1', body: 'for b1' });
    await t.call('POST', '/api/agent/messages', { sessionId: 'a1', kind: 'done', body: 'fixed' });
    await t.call('POST', '/api/messages', { roomId: 'raffaello', body: 'room-wide' });
    t.clock.now += STALE_AFTER_MS + 1;
    const res = await t.call('GET', '/api/agents/a1');
    expect(res.status).toBe(200);
    const a = await res.json<AgentRes>();
    expect(a.agent).toMatchObject({ id: 'a1', state: 'stale', lastReport: 'fixed' });
    expect(a.events.map((e) => [e.event, e.excerpt])).toEqual([
      ['prompt', 'fix the flaky test in the payment module'],
      ['session_start', null],
    ]);
    expect(a.events[0]).toMatchObject({ id: 3, at: t.clock.now - STALE_AFTER_MS - 1 });
    expect(a.messages.map((m) => [m.kind, m.body])).toEqual([
      ['done', 'fixed'],
      ['owner', 'for a1'],
    ]);
  });
});

describe('POST /api/messages', () => {
  it('validates the body and the target', async () => {
    const t = createTestApp();
    const bad = async (body: unknown) => {
      const res = await t.call('POST', '/api/messages', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'a non-empty body and exactly one of roomId / toAgentId',
      });
    };
    await bad('str');
    await bad({ roomId: 'lobby', body: '  ' });
    await bad({ roomId: 'lobby', body: 'x'.repeat(4001) });
    await bad({ body: 'no target' });
    await bad({ roomId: 'lobby', toAgentId: 'a', body: 'both' });
    await bad({ roomId: 7, body: 'wrong type' });
    await bad({ roomId: 'lobby' });
    await bad({ roomId: 'lobby', body: 5 });
    expect(
      (await t.call('POST', '/api/messages', { roomId: 'lobby', body: 'x'.repeat(4000) })).status,
    ).toBe(201);
    const raw = await t.app.request(
      '/api/messages',
      { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } },
      t.env,
    );
    expect(raw.status).toBe(400);
  });

  it('404s unknown rooms and agents', async () => {
    const t = createTestApp();
    const noRoom = await t.call('POST', '/api/messages', { roomId: 'nope', body: 'x' });
    expect(noRoom.status).toBe(404);
    expect(await noRoom.json()).toEqual({ error: 'room not found' });
    const noAgent = await t.call('POST', '/api/messages', { toAgentId: 'nope', body: 'x' });
    expect(noAgent.status).toBe(404);
    expect(await noAgent.json()).toEqual({ error: 'agent not found' });
  });

  it('posts to a room, or to an agent in the agent room', async () => {
    const t = createTestApp();
    await start(t, 'a1', 'raffaello');
    t.clock.now += MIN;
    const toRoom = await t.call('POST', '/api/messages', { roomId: 'lobby', body: ' hello ' });
    expect(toRoom.status).toBe(201);
    expect((await toRoom.json<{ message: MessageView }>()).message).toEqual({
      id: 1,
      at: t.clock.now,
      roomId: 'lobby',
      kind: 'owner',
      body: 'hello',
      author: { type: 'owner' },
      toAgentId: null,
      handled: false,
      deliveredTo: [],
    });
    const toAgent = await t.call('POST', '/api/messages', { toAgentId: 'a1', body: 'psst' });
    expect((await toAgent.json<{ message: MessageView }>()).message).toMatchObject({
      id: 2,
      roomId: 'raffaello',
      toAgentId: 'a1',
    });
  });
});

describe('POST /api/messages/:id/handled', () => {
  it('flags and unflags a suggestion, and nothing else', async () => {
    const t = createTestApp();
    await start(t, 'a1', 'raffaello');
    await t.call('POST', '/api/agent/messages', { sessionId: 'a1', kind: 'suggest', body: 'idea' });
    await t.call('POST', '/api/agent/messages', { sessionId: 'a1', kind: 'progress', body: 'no' });
    expect((await board(t)).openSuggestions).toBe(1);
    const on = await t.call('POST', '/api/messages/1/handled', { handled: true });
    expect(on.status).toBe(200);
    expect((await board(t)).openSuggestions).toBe(0);
    expect(await on.json()).toEqual({ id: 1, handled: true });
    expect((await room(t, 'suggestions')).messages[0]?.handled).toBe(true);
    const off = await t.call('POST', '/api/messages/1/handled', { handled: false });
    expect(await off.json()).toEqual({ id: 1, handled: false });
    expect((await room(t, 'suggestions')).messages[0]?.handled).toBe(false);
    for (const path of [
      '/api/messages/2/handled',
      '/api/messages/99/handled',
      '/api/messages/x/handled',
    ]) {
      const res = await t.call('POST', path, { handled: true });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'suggestion not found' });
    }
    const bad = await t.call('POST', '/api/messages/1/handled', { handled: 'yes' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'handled must be a boolean' });
    expect((await t.call('POST', '/api/messages/1/handled', 'nope')).status).toBe(400);
  });
});

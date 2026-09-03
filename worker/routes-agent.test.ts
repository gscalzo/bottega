import { describe, expect, it, vi } from 'vitest';
import type { AgentEventRes, AgentPostRes, AgentRes, BoardRes } from '../shared/types';
import { createTestApp, event, session } from './test/harness';
import type { TestApp } from './test/harness';

const MIN = 60_000;
const asEvent = async (res: Response): Promise<AgentEventRes> => {
  expect(res.status).toBe(200);
  return res.json<AgentEventRes>();
};
const agentOf = async (t: TestApp, id: string) =>
  (await (await t.call('GET', `/api/agents/${id}`)).json<AgentRes>()).agent;
const post = (t: TestApp, sessionId: string, kind: string, body: string) =>
  t.call('POST', '/api/agent/messages', { sessionId, kind, body });
const ownerMessage = (t: TestApp, target: Record<string, string>, body: string) =>
  t.call('POST', '/api/messages', { ...target, body });

describe('POST /api/agent/events', () => {
  it('creates the agent and its room on session_start', async () => {
    const t = createTestApp();
    const { agent, messages } = await asEvent(await event(t, 'session_start', 'sess-1234-x'));
    expect(messages).toEqual([]);
    expect(agent).toMatchObject({
      id: 'sess-1234-x',
      harness: 'claude',
      roomId: 'raffaello',
      name: 'claude · raffaello · sess',
      host: 'macbook',
      cwd: '/work/raffaello',
      model: 'test-model',
      state: 'online',
      stateSince: t.clock.now,
      task: null,
      taskSource: null,
      lastReport: null,
      firstSeen: t.clock.now,
      lastSeen: t.clock.now,
    });
    expect(t.raw.prepare("SELECT kind FROM rooms WHERE id = 'raffaello'").get()).toEqual({
      kind: 'repo',
    });
    expect(t.raw.prepare('SELECT event, excerpt FROM events').all()).toEqual([
      { event: 'session_start', excerpt: null },
    ]);
  });

  it('slugs the repo and accepts a null model', async () => {
    const t = createTestApp();
    const res = await t.call('POST', '/api/agent/events', {
      event: 'session_start',
      session: { ...session('s1'), repo: 'iOS.Blogs Analyzer', model: null, harness: 'codex' },
    });
    const { agent } = await asEvent(res);
    expect(agent.roomId).toBe('ios-blogs-analyzer');
    expect(agent.model).toBeNull();
    expect(agent.name).toBe('codex · ios-blogs-analyzer · s1');
    const noModel = { id: 's2', harness: 'claude', host: 'macbook', cwd: '/w', repo: 'raffaello' };
    const omitted = await asEvent(
      await t.call('POST', '/api/agent/events', { event: 'session_start', session: noModel }),
    );
    expect(omitted.agent.model).toBeNull();
    await event(t, 'session_start', 's3');
    const kept = await asEvent(
      await t.call('POST', '/api/agent/events', {
        event: 'prompt',
        session: { ...noModel, id: 's3' },
      }),
    );
    expect(kept.agent.model).toBe('test-model');
  });

  it('walks the state machine and resets state_since only on change', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    t.clock.now += MIN;
    expect((await asEvent(await event(t, 'prompt', 's1'))).agent).toMatchObject({
      state: 'working',
      stateSince: t.clock.now,
    });
    const since = t.clock.now;
    t.clock.now += MIN;
    expect((await asEvent(await event(t, 'heartbeat', 's1'))).agent).toMatchObject({
      state: 'working',
      stateSince: since,
      lastSeen: t.clock.now,
    });
    t.clock.now += MIN;
    expect((await asEvent(await event(t, 'prompt', 's1'))).agent).toMatchObject({
      state: 'working',
      stateSince: since,
    });
    t.clock.now += MIN;
    expect((await asEvent(await event(t, 'stop', 's1'))).agent).toMatchObject({
      state: 'idle',
      stateSince: t.clock.now,
    });
    t.clock.now += MIN;
    expect((await asEvent(await event(t, 'session_end', 's1'))).agent).toMatchObject({
      state: 'gone',
      stateSince: t.clock.now,
    });
    t.clock.now += MIN;
    const resumed = await asEvent(
      await t.call('POST', '/api/agent/events', {
        event: 'session_start',
        session: { ...session('s1', 'other'), host: 'desk', cwd: '/w/other', model: 'm2' },
      }),
    );
    expect(resumed.agent).toMatchObject({
      state: 'online',
      roomId: 'other',
      name: 'claude · other · s1',
      host: 'desk',
      cwd: '/w/other',
      model: 'm2',
      firstSeen: t.clock.now - 6 * MIN,
    });
    expect(t.raw.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 7 });
  });

  it('starts a never-seen agent from any event', async () => {
    const t = createTestApp();
    expect((await asEvent(await event(t, 'heartbeat', 'h1'))).agent.state).toBe('online');
    expect((await asEvent(await event(t, 'stop', 'h2'))).agent.state).toBe('idle');
  });

  it('applies the task and report rules to excerpts', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    const short = await asEvent(await event(t, 'prompt', 's1', { excerpt: 'y' }));
    expect(short.agent.task).toBeNull();
    const long = 'please  refactor\n the payment   module and add tests';
    const meaningful = await asEvent(await event(t, 'prompt', 's1', { excerpt: long }));
    expect(meaningful.agent).toMatchObject({
      task: 'please refactor the payment module and add tests',
      taskSource: 'prompt',
    });
    const huge = 'x'.repeat(500);
    const capped = await asEvent(await event(t, 'prompt', 's1', { excerpt: huge }));
    expect(capped.agent.task).toHaveLength(200);
    expect(capped.agent.task?.endsWith('…')).toBe(true);
    const report = await asEvent(await event(t, 'stop', 's1', { excerpt: `done ${huge}` }));
    expect(report.agent.lastReport).toHaveLength(300);
    expect(report.agent.lastReport?.startsWith('done xxx')).toBe(true);
    const silent = await asEvent(await event(t, 'stop', 's1'));
    expect(silent.agent.lastReport).toBe(report.agent.lastReport);
    await event(t, 'session_end', 's1', { excerpt: 'ignored' });
    const excerpts = t.raw
      .prepare('SELECT event, excerpt FROM events ORDER BY id')
      .all()
      .map((r) => [r.event, r.excerpt === null ? null : String(r.excerpt).length]);
    expect(excerpts).toEqual([
      ['session_start', null],
      ['prompt', 1],
      ['prompt', 48],
      ['prompt', 200],
      ['stop', 300],
      ['stop', null],
      ['session_end', null],
    ]);
  });

  it('delivers the owner messages once, direct or room, within the limit', async () => {
    const t = createTestApp();
    await ownerMessage(t, { roomId: 'lobby' }, 'lobby before anyone');
    t.clock.now += MIN;
    await event(t, 'session_start', 'a1');
    await event(t, 'session_start', 'l1', { repo: 'lobby' });
    t.clock.now += MIN;
    await ownerMessage(t, { roomId: 'raffaello' }, 'room msg');
    await ownerMessage(t, { toAgentId: 'a1' }, 'direct msg');
    await ownerMessage(t, { roomId: 'lobby' }, 'lobby msg');
    t.clock.now += MIN;
    const first = await asEvent(await event(t, 'prompt', 'a1'));
    expect(first.messages).toEqual([
      { id: 2, at: t.clock.now - MIN, body: 'room msg', scope: 'room' },
      { id: 3, at: t.clock.now - MIN, body: 'direct msg', scope: 'direct' },
    ]);
    const again = await asEvent(await event(t, 'prompt', 'a1'));
    expect(again.messages).toEqual([]);
    const lobby = await asEvent(await event(t, 'prompt', 'l1', { repo: 'lobby' }));
    expect(lobby.messages.map((m) => m.body)).toEqual(['lobby msg']);
    expect(
      t.raw.prepare('SELECT message_id, agent_id, at FROM deliveries ORDER BY message_id').all(),
    ).toEqual([
      { message_id: 2, agent_id: 'a1', at: t.clock.now },
      { message_id: 3, agent_id: 'a1', at: t.clock.now },
      { message_id: 4, agent_id: 'l1', at: t.clock.now },
    ]);
    t.clock.now += MIN;
    await event(t, 'session_start', 'late');
    expect((await asEvent(await event(t, 'prompt', 'late'))).messages).toEqual([]);
    for (let i = 0; i < 12; i++) await ownerMessage(t, { toAgentId: 'a1' }, `m${i}`);
    t.clock.now += MIN;
    const page = await asEvent(await event(t, 'session_start', 'a1'));
    expect(page.messages.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`));
    expect((await asEvent(await event(t, 'prompt', 'a1'))).messages.map((m) => m.body)).toEqual([
      'm10',
      'm11',
    ]);
    await ownerMessage(t, { toAgentId: 'a1' }, 'quiet');
    expect((await asEvent(await event(t, 'stop', 'a1'))).messages).toEqual([]);
    expect((await asEvent(await event(t, 'heartbeat', 'a1'))).messages).toEqual([]);
    expect((await asEvent(await event(t, 'session_end', 'a1'))).messages).toEqual([]);
  });

  it('rejects malformed events', async () => {
    const t = createTestApp();
    const bad = async (body: unknown) => {
      const res = await t.call('POST', '/api/agent/events', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid event' });
    };
    await bad([]);
    await bad({ event: 'prompt' });
    await bad({ event: 'prompt', session: 'x' });
    await bad({ event: 'prompt', session: null });
    await bad({ event: 'dance', session: session('s') });
    await bad({ event: 'prompt', session: { ...session('s'), harness: 'gemini' } });
    await bad({ event: 'prompt', session: { ...session('s'), id: ' ' } });
    await bad({ event: 'prompt', session: { ...session('s'), model: 5 } });
    await bad({ event: 'prompt', session: session('s'), excerpt: 5 });
    const raw = await t.app.request(
      '/api/agent/events',
      { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } },
      t.env,
    );
    expect(raw.status).toBe(400);
  });
});

describe('POST /api/agent/messages', () => {
  it('needs a known session', async () => {
    const t = createTestApp();
    const res = await post(t, 'ghost', 'progress', 'hello');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'agent not found — has the SessionStart hook run?' });
  });

  it('validates kind, body and session id', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    const bad = async (body: unknown) => {
      const res = await t.call('POST', '/api/agent/messages', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid message' });
    };
    await bad(null);
    await bad({ sessionId: 's1', kind: 'owner', body: 'x' });
    await bad({ sessionId: 's1', kind: 'progress', body: '   ' });
    await bad({ sessionId: 's1', kind: 'progress', body: 'x'.repeat(4001) });
    await bad({ sessionId: '', kind: 'progress', body: 'x' });
    await bad({ sessionId: 5, kind: 'progress', body: 'x' });
    await bad({ sessionId: 's1', kind: 7, body: 'x' });
    expect((await post(t, 's1', 'progress', 'x'.repeat(4000))).status).toBe(201);
  });

  it('sets the task line, which later prompts do not override', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    t.clock.now += MIN;
    const res = await post(t, 's1', 'task', '  Migrating the schema  ');
    expect(res.status).toBe(201);
    const { message, agent } = await res.json<AgentPostRes>();
    expect(message).toEqual({
      id: 1,
      at: t.clock.now,
      roomId: 'raffaello',
      kind: 'task',
      body: 'Migrating the schema',
      author: { type: 'agent', id: 's1', name: 'claude · raffaello · s1' },
      toAgentId: null,
      handled: false,
      deliveredTo: [],
    });
    expect(agent).toMatchObject({
      task: 'Migrating the schema',
      taskSource: 'agent',
      lastSeen: t.clock.now,
    });
    await event(t, 'prompt', 's1', { excerpt: 'now do something completely different please' });
    expect(await agentOf(t, 's1')).toMatchObject({
      task: 'Migrating the schema',
      taskSource: 'agent',
    });
    await post(t, 's1', 'task', 'x'.repeat(250));
    expect((await agentOf(t, 's1')).task).toHaveLength(200);
  });

  it('marks a question as waiting until the next prompt, surviving a stop', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    await event(t, 'prompt', 's1');
    t.clock.now += MIN;
    const { agent } = await (await post(t, 's1', 'question', 'ship it?')).json<AgentPostRes>();
    expect(agent).toMatchObject({ state: 'waiting', stateSince: t.clock.now, lastReport: null });
    await event(t, 'stop', 's1', { excerpt: 'Shall I ship it?' });
    expect(await agentOf(t, 's1')).toMatchObject({
      state: 'waiting',
      lastReport: 'Shall I ship it?',
    });
    await event(t, 'prompt', 's1');
    expect((await agentOf(t, 's1')).state).toBe('working');
  });

  it('records progress and done as the last report', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    await post(t, 's1', 'progress', 'half way');
    expect((await agentOf(t, 's1')).lastReport).toBe('half way');
    await post(t, 's1', 'done', 'x'.repeat(400));
    expect((await agentOf(t, 's1')).lastReport).toHaveLength(300);
  });

  it('files suggestions in the suggestions room without touching the card', async () => {
    const t = createTestApp();
    await event(t, 'session_start', 's1');
    await event(t, 'prompt', 's1', { excerpt: 'work on the thing for a while please' });
    const before = await agentOf(t, 's1');
    t.clock.now += MIN;
    const { message, agent } = await (
      await post(t, 's1', 'suggest', 'show token spend per agent')
    ).json<AgentPostRes>();
    expect(message.roomId).toBe('suggestions');
    expect(agent).toEqual({ ...before, lastSeen: t.clock.now });
    const board = await (await t.call('GET', '/api/board')).json<BoardRes>();
    expect(board.rooms.find((r) => r.id === 'suggestions')?.lastActivity).toBe(t.clock.now);
  });
});

describe('app plumbing', () => {
  it('answers 404 for unknown routes and 500 for a broken database', async () => {
    const t = createTestApp();
    const missing = await t.call('GET', '/api/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not found' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      prepare: () => {
        throw new Error('boom');
      },
    } as unknown as D1Database;
    const res = await t.app.request('/api/board', { method: 'GET' }, { ...t.env, DB: broken });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

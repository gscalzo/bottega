import { describe, expect, it } from 'vitest';
import type { AgentPostRes } from '../shared/types';
import { parseArgs, run, USAGE } from './cli';
import { fakeIo, json } from './test/fake-io';

const stdin =
  (text = '') =>
  () =>
    Promise.resolve(text);
const posted: AgentPostRes = {
  message: {} as AgentPostRes['message'],
  agent: { name: 'claude · raffaello · s1', state: 'working' } as AgentPostRes['agent'],
};

describe('parseArgs', () => {
  it('splits the command, joins the text and lifts --session from anywhere', () => {
    expect(parseArgs([])).toEqual({
      command: 'help',
      text: '',
      session: undefined,
      interval: undefined,
      flags: new Set(),
    });
    expect(parseArgs(['task', 'fix', 'the', 'build'])).toMatchObject({
      command: 'task',
      text: 'fix the build',
      session: undefined,
    });
    expect(parseArgs(['--session', 'x', 'done', ' shipped '])).toMatchObject({
      command: 'done',
      text: 'shipped',
      session: 'x',
    });
    expect(parseArgs(['done', 'a', '--session', 'y', 'b'])).toMatchObject({
      command: 'done',
      text: 'a b',
      session: 'y',
    });
    expect(parseArgs(['done', '--session'])).toMatchObject({
      command: 'done',
      text: '',
      session: undefined,
    });
    expect(parseArgs(['status', '--waybar'])).toMatchObject({
      command: 'status',
      flags: new Set(['waybar']),
    });
    expect(parseArgs(['watch', '--interval', '9', '--once'])).toMatchObject({
      command: 'watch',
      interval: '9',
      flags: new Set(['once']),
    });
  });
});

describe('run', () => {
  it('prints usage for help and unknown commands', async () => {
    const help = fakeIo();
    expect(await run([], stdin(), help.io)).toBe(2);
    expect(help.err).toEqual([USAGE]);
    const unknown = fakeIo();
    expect(await run(['dance'], stdin(), unknown.io)).toBe(2);
    expect(unknown.err[0]).toBe('bottega: unknown command "dance"\n\n');
  });

  it('refuses posts without text, over the limit, or without a session', async () => {
    const empty = fakeIo({ env: { BOTTEGA_SESSION_ID: 's1' } });
    expect(await run(['task'], stdin(), empty.io)).toBe(2);
    expect(empty.err[0]).toBe('bottega: task needs a text\n\n');
    const long = fakeIo({ env: { BOTTEGA_SESSION_ID: 's1' }, responses: [json(201, posted)] });
    expect(await run(['done', 'x'.repeat(4001)], stdin(), long.io)).toBe(2);
    expect(long.err[0]).toBe('bottega: text longer than 4000\n\n');
    expect(await run(['done', 'x'.repeat(4000)], stdin(), long.io)).toBe(0);
    const noSession = fakeIo();
    expect(await run(['progress', 'hi'], stdin(), noSession.io)).toBe(2);
    expect(noSession.err[0]).toBe('bottega: no session id: pass --session <id>\n\n');
    expect(noSession.requests).toEqual([]);
  });

  it('posts each kind with the resolved session and reports the card state', async () => {
    const fake = fakeIo({
      env: { BOTTEGA_SESSION_ID: 'env-s' },
      responses: [json(201, posted), json(201, posted)],
    });
    expect(await run(['question', 'ship', 'it?'], stdin(), fake.io)).toBe(0);
    expect(await run(['suggest', 'more', 'cowbell', '--session', 'flag-s'], stdin(), fake.io)).toBe(
      0,
    );
    expect(
      fake.requests.map((r) => [r.url, JSON.parse(r.init.body ?? '') as unknown, r.init.timeoutMs]),
    ).toEqual([
      [
        'https://bottega.effectivecode.co.uk/api/agent/messages',
        { sessionId: 'env-s', kind: 'question', body: 'ship it?' },
        8000,
      ],
      [
        'https://bottega.effectivecode.co.uk/api/agent/messages',
        { sessionId: 'flag-s', kind: 'suggest', body: 'more cowbell' },
        8000,
      ],
    ]);
    expect(fake.out).toEqual([
      'bottega: question posted as claude · raffaello · s1 (state working)\n',
      'bottega: suggest posted as claude · raffaello · s1 (state working)\n',
    ]);
  });

  it('reports server refusals and network failures on stderr with exit 1', async () => {
    const refused = fakeIo({
      env: { BOTTEGA_SESSION_ID: 's' },
      responses: [json(404, { error: 'agent not found' })],
    });
    expect(await run(['done', 'x'], stdin(), refused.io)).toBe(1);
    expect(refused.err).toEqual(['bottega: 404: agent not found\n']);
    const down = fakeIo({ env: { BOTTEGA_SESSION_ID: 's' } });
    expect(await run(['done', 'x'], stdin(), down.io)).toBe(1);
    expect(down.err).toEqual(['bottega: Error: fetch failed\n']);
  });

  it('pings and says who the server sees', async () => {
    const fake = fakeIo({ responses: [json(200, { ok: true, caller: 'agent' })] });
    expect(await run(['ping'], stdin(), fake.io)).toBe(0);
    expect(fake.requests[0]).toMatchObject({
      url: 'https://bottega.effectivecode.co.uk/api/ping',
      init: { method: 'GET' },
    });
    expect(fake.out).toEqual([
      'bottega: https://bottega.effectivecode.co.uk answers; you are seen as "agent"\n',
    ]);
  });

  it('answers whoami without the network', async () => {
    const known = fakeIo({ env: { CLAUDE_CODE_SESSION_ID: 'cc' } });
    expect(await run(['whoami'], stdin(), known.io)).toBe(0);
    expect(known.out).toEqual(['session cc\nurl https://bottega.effectivecode.co.uk\n']);
    const unknown = fakeIo();
    await run(['whoami'], stdin(), unknown.io);
    expect(unknown.out).toEqual([
      'session (unknown — pass --session)\nurl https://bottega.effectivecode.co.uk\n',
    ]);
    expect(unknown.requests).toEqual([]);
  });

  it('hands the hook its harness and stdin', async () => {
    const fake = fakeIo({
      responses: [json(200, { agent: { id: 's1', name: 'n' }, messages: [] })],
    });
    const payload = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', cwd: '/w' });
    expect(await run(['hook', 'codex'], stdin(payload), fake.io)).toBe(0);
    expect(JSON.parse(fake.requests[0]?.init.body ?? '')).toMatchObject({
      event: 'stop',
      session: { harness: 'codex' },
    });
    const bare = fakeIo({
      responses: [json(200, { agent: { id: 's1', name: 'n' }, messages: [] })],
    });
    expect(await run(['hook'], stdin(payload), bare.io)).toBe(0);
    expect(JSON.parse(bare.requests[0]?.init.body ?? '')).toMatchObject({
      session: { harness: 'codex' },
    });
    const claude = fakeIo({
      responses: [json(200, { agent: { id: 's1', name: 'n' }, messages: [] })],
    });
    expect(await run(['hook', 'claude'], stdin(payload), claude.io)).toBe(0);
    expect(JSON.parse(claude.requests[0]?.init.body ?? '')).toMatchObject({
      session: { harness: 'claude' },
    });
  });
});

describe('status, watch and channel commands', () => {
  const empty = {
    now: 1_700_000_000_000,
    counts: { working: 0, waiting: 0, idle: 0, stale: 0 },
    rooms: [],
    openSuggestions: 0,
  };
  it('renders the board in the asked format', async () => {
    for (const [flag, expected] of [
      [[], 'Nobody in the workshop.\n'],
      [['--json'], `${JSON.stringify(empty)}\n`],
      [['--swiftbar'], '◇\n---'],
      [['--waybar'], '{"text":"◇"'],
    ] as const) {
      const fake = fakeIo({ responses: [json(200, empty)] });
      expect(await run(['status', ...flag], stdin(), fake.io)).toBe(0);
      expect(fake.out[0]?.startsWith(expected)).toBe(true);
    }
  });
  it('runs one watcher pass on --once with the interval asked', async () => {
    const fake = fakeIo({ responses: [json(200, empty), json(200, { messages: [] })] });
    expect(await run(['watch', '--once', '--interval', '2'], stdin(), fake.io)).toBe(0);
    expect(fake.sleeps).toEqual([2000]);
    expect(fake.requests).toHaveLength(2);
    const one = fakeIo({ responses: [json(200, empty), json(200, { messages: [] })] });
    expect(await run(['watch', '--once', '--interval', '1'], stdin(), one.io)).toBe(0);
    expect(one.sleeps).toEqual([1000]);
  });
  it('refuses a bad interval', async () => {
    const fake = fakeIo();
    expect(await run(['watch', '--interval', '0'], stdin(), fake.io)).toBe(2);
    expect(fake.err[0]).toBe('bottega: --interval must be a number of seconds, at least 1\n\n');
    expect(await run(['channel', '--interval', 'soon'], stdin(), fake.io)).toBe(2);
  });
  it('starts the channel, which waits for the hook marker', async () => {
    const fake = fakeIo({
      env: { CLAUDE_PID: '1' },
      exec: () => ({ status: 1, stdout: '', stderr: '' }),
    });
    fake.io.readFile = () => null;
    expect(await run(['channel', '--once'], stdin(), fake.io)).toBe(0);
    expect(fake.err[0]).toContain('no session marker found');
  });
});

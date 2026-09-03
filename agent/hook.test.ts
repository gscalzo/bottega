import { describe, expect, it } from 'vitest';
import { HEARTBEAT_EVERY_MS } from '../shared/rules';
import type { AgentEventRes, AgentView } from '../shared/types';
import {
  CLI_HINT,
  excerptFor,
  formatInjection,
  heartbeatDue,
  hookEventFor,
  parseHookInput,
  planHook,
  recordLocally,
  runHook,
} from './hook';
import { fakeIo, json } from './test/fake-io';

const NOW = 1_700_000_000_000;
const HB = '/home/gio/.bottega/state/heartbeat/s1';
const MARKER = '/home/gio/.bottega/state/cwd/%2Fwork%2Fraffaello';
const input = (hook_event_name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ hook_event_name, session_id: 's1', cwd: '/work/raffaello', ...extra });
const agent = (over: Partial<AgentView> = {}): AgentView =>
  ({ id: 's1', name: 'claude · raffaello · s1', state: 'online', ...over }) as AgentView;
const res = (messages: AgentEventRes['messages'] = []): AgentEventRes => ({
  agent: agent(),
  messages,
});

describe('parseHookInput', () => {
  it('accepts only JSON objects', () => {
    expect(parseHookInput('{"a":1}')).toEqual({ a: 1 });
    expect(parseHookInput('[1]')).toBeNull();
    expect(parseHookInput('null')).toBeNull();
    expect(parseHookInput('nope')).toBeNull();
    expect(parseHookInput('')).toBeNull();
    expect(parseHookInput('5')).toBeNull();
    expect(parseHookInput('"str"')).toBeNull();
  });
});

describe('hookEventFor', () => {
  it('maps harness events to Bottega events', () => {
    expect(hookEventFor({ hook_event_name: 'SessionStart' })).toBe('session_start');
    expect(hookEventFor({ hook_event_name: 'SessionStart', source: 'resume' })).toBe(
      'session_start',
    );
    expect(hookEventFor({ hook_event_name: 'SessionStart', source: 'compact' })).toBe('prompt');
    expect(hookEventFor({ hook_event_name: 'UserPromptSubmit' })).toBe('prompt');
    expect(hookEventFor({ hook_event_name: 'PostToolUse' })).toBe('heartbeat');
    expect(hookEventFor({ hook_event_name: 'Stop' })).toBe('stop');
    expect(hookEventFor({ hook_event_name: 'SessionEnd' })).toBe('session_end');
    expect(hookEventFor({ hook_event_name: 'PreToolUse' })).toBeNull();
    expect(hookEventFor({})).toBeNull();
  });
});

describe('excerptFor', () => {
  it('takes the prompt on prompts and the final message on stops', () => {
    const i = { prompt: 'p', last_assistant_message: 'm' };
    expect(excerptFor('prompt', i)).toBe('p');
    expect(excerptFor('stop', i)).toBe('m');
    expect(excerptFor('prompt', {})).toBeNull();
    expect(excerptFor('stop', {})).toBeNull();
    expect(excerptFor('session_start', i)).toBeNull();
    expect(excerptFor('heartbeat', i)).toBeNull();
  });
});

describe('heartbeatDue', () => {
  it('is due without a stamp, or when the stamp is old enough', () => {
    expect(heartbeatDue(fakeIo().io, HB, NOW)).toBe(true);
    const recent = fakeIo({ files: { [HB]: `${NOW - HEARTBEAT_EVERY_MS + 1}\n` } });
    expect(heartbeatDue(recent.io, HB, NOW)).toBe(false);
    const exact = fakeIo({ files: { [HB]: `${NOW - HEARTBEAT_EVERY_MS}` } });
    expect(heartbeatDue(exact.io, HB, NOW)).toBe(true);
    expect(heartbeatDue(fakeIo({ files: { [HB]: 'junk' } }).io, HB, NOW)).toBe(false);
  });
});

describe('formatInjection', () => {
  const start = { hook_event_name: 'SessionStart' };
  const prompt = { hook_event_name: 'UserPromptSubmit' };
  const m1 = { id: 1, at: NOW, body: 'stop and run the gate', scope: 'room' as const };
  const m2 = { id: 2, at: NOW + 60_000, body: 'then ship', scope: 'direct' as const };
  it('introduces the agent on SessionStart, with or without messages', () => {
    expect(formatInjection(start, res())).toBe(
      `Bottega: you are "claude · raffaello · s1" (session s1). Report with the bottega skill — \`${CLI_HINT} task|progress|done|question|suggest "<text>"\` (add --session s1 if BOTTEGA_SESSION_ID is unset). No messages waiting.\n`,
    );
    expect(formatInjection(start, res([m1]))).toContain(
      '1 message from the owner:\n- [2023-11-14 22:13Z · room] stop and run the gate\n',
    );
    expect(formatInjection(start, res([m1, m2]))).toContain(
      '2 messages from the owner:\n- [2023-11-14 22:13Z · room] stop and run the gate\n- [2023-11-14 22:14Z · direct] then ship\n',
    );
  });
  it('says nothing on a prompt without messages, and only the messages otherwise', () => {
    expect(formatInjection(prompt, res())).toBe('');
    expect(formatInjection(prompt, res([m2]))).toBe(
      'Bottega: 1 message from the owner:\n- [2023-11-14 22:14Z · direct] then ship\n',
    );
  });
});

describe('planHook', () => {
  it('ignores junk, subagents, sessions without an id and unknown events', () => {
    const io = fakeIo().io;
    expect(planHook(io, 'claude', 'junk')).toBeNull();
    expect(planHook(io, 'claude', input('Stop', { agent_id: 'sub' }))).toBeNull();
    expect(planHook(io, 'claude', JSON.stringify({ hook_event_name: 'Stop' }))).toBeNull();
    expect(planHook(io, 'claude', input('PreToolUse'))).toBeNull();
  });
  it('builds the event from the hook input and the environment', () => {
    const fake = fakeIo({ git: () => '/work/Raffaello/.git' });
    const plan = planHook(
      fake.io,
      'codex',
      input('UserPromptSubmit', { prompt: 'do it', model: 'gpt' }),
    );
    expect(plan).toEqual({
      req: {
        event: 'prompt',
        session: {
          id: 's1',
          harness: 'codex',
          host: 'macbook',
          cwd: '/work/raffaello',
          repo: 'raffaello',
          model: 'gpt',
        },
        excerpt: 'do it',
      },
      input: {
        hook_event_name: 'UserPromptSubmit',
        session_id: 's1',
        cwd: '/work/raffaello',
        prompt: 'do it',
        model: 'gpt',
      },
      sessionId: 's1',
      cwd: '/work/raffaello',
    });
  });
  it('falls back to the process cwd, no model, and the harness from the environment', () => {
    const claude = fakeIo({ env: { CLAUDECODE: '1' }, cwd: '/elsewhere', git: () => null });
    const plan = planHook(
      claude.io,
      '',
      JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }),
    );
    expect(plan?.req.session).toMatchObject({
      harness: 'claude',
      cwd: '/elsewhere',
      repo: 'elsewhere',
      model: null,
    });
    const codex = fakeIo({ git: () => null });
    expect(planHook(codex.io, 'gemini', input('Stop'))?.req.session.harness).toBe('codex');
    expect(planHook(codex.io, 'claude', input('Stop'))?.req.session.harness).toBe('claude');
    expect(planHook(claude.io, 'codex', input('Stop'))?.req.session.harness).toBe('codex');
  });
  it('throttles only heartbeats', () => {
    const fresh = fakeIo({ files: { [HB]: `${NOW - 1000}` } });
    expect(planHook(fresh.io, 'claude', input('UserPromptSubmit'))?.req.event).toBe('prompt');
    expect(planHook(fresh.io, 'claude', input('Stop'))?.req.event).toBe('stop');
  });
  it('throttles heartbeats', () => {
    const fresh = fakeIo({ files: { [HB]: `${NOW - 1000}` } });
    expect(planHook(fresh.io, 'claude', input('PostToolUse'))).toBeNull();
    const due = fakeIo({ files: { [HB]: `${NOW - HEARTBEAT_EVERY_MS}` } });
    expect(planHook(due.io, 'claude', input('PostToolUse'))?.req.event).toBe('heartbeat');
  });
});

describe('recordLocally', () => {
  const plan = (event: string, stdin: string, fake = fakeIo()) => {
    const p = planHook(fake.io, 'claude', stdin);
    if (!p) throw new Error('no plan');
    expect(p.req.event).toBe(event);
    recordLocally(fake.io, p);
    return fake;
  };
  it('leaves a marker on session_start, and an env export when the harness offers one', () => {
    const bare = plan('session_start', input('SessionStart'));
    expect(bare.files.get(MARKER)).toBe('s1\n');
    expect([...bare.files.keys()]).toEqual([MARKER]);
    const fake = fakeIo({ env: { CLAUDE_ENV_FILE: '/tmp/envfile' } });
    plan('session_start', input('SessionStart'), fake);
    expect(fake.files.get('/tmp/envfile')).toBe('export BOTTEGA_SESSION_ID=s1\n');
  });
  it('stamps heartbeats', () => {
    expect(plan('heartbeat', input('PostToolUse')).files.get(HB)).toBe(`${NOW}\n`);
  });
  it('cleans up on session_end, but only its own marker', () => {
    const own = fakeIo({ files: { [MARKER]: 's1\n', [HB]: '1' } });
    plan('session_end', input('SessionEnd'), own);
    expect([...own.files.keys()]).toEqual([]);
    const other = fakeIo({ files: { [MARKER]: 's2\n', [HB]: '1' } });
    plan('session_end', input('SessionEnd'), other);
    expect([...other.files.keys()]).toEqual([MARKER]);
  });
  it('touches nothing on prompts and stops', () => {
    expect(plan('prompt', input('UserPromptSubmit')).files.size).toBe(0);
    expect(plan('stop', input('Stop')).files.size).toBe(0);
    const kept = fakeIo({ files: { [MARKER]: 's1\n', [HB]: '1' } });
    plan('prompt', input('UserPromptSubmit'), kept);
    plan('stop', input('Stop'), kept);
    expect([...kept.files.keys()].sort()).toEqual([MARKER, HB].sort());
  });
});

describe('runHook', () => {
  it('posts the event with the event timeout and prints the injection', async () => {
    const fake = fakeIo({
      responses: [json(200, res([{ id: 1, at: NOW, body: 'hi', scope: 'room' }]))],
    });
    expect(await runHook(fake.io, 'claude', input('SessionStart'))).toBe(0);
    expect(fake.requests[0]).toMatchObject({
      url: 'https://bottega.effectivecode.co.uk/api/agent/events',
      init: { method: 'POST', timeoutMs: 4000 },
    });
    expect(JSON.parse(fake.requests[0]?.init.body ?? '')).toMatchObject({ event: 'session_start' });
    expect(fake.out.join('')).toContain('you are "claude · raffaello · s1"');
    expect(fake.out.join('')).toContain('- [2023-11-14 22:13Z · room] hi');
    expect(fake.files.get(MARKER)).toBe('s1\n');
  });
  it('prints messages on prompts, nothing on stops, and uses per-event timeouts', async () => {
    const fake = fakeIo({
      responses: [
        json(200, res([{ id: 1, at: NOW, body: 'go', scope: 'direct' }])),
        json(200, res()),
        json(200, res()),
      ],
    });
    await runHook(fake.io, 'claude', input('UserPromptSubmit', { prompt: 'x' }));
    await runHook(fake.io, 'claude', input('Stop'));
    await runHook(fake.io, 'claude', input('SessionEnd'));
    expect(fake.out).toEqual([
      'Bottega: 1 message from the owner:\n- [2023-11-14 22:13Z · direct] go\n',
    ]);
    expect(fake.requests.map((r) => r.init.timeoutMs)).toEqual([4000, 4000, 2000]);
    const hb = fakeIo({ responses: [json(200, res())] });
    await runHook(hb.io, 'claude', input('PostToolUse'));
    expect(hb.requests[0]?.init.timeoutMs).toBe(3000);
    expect(hb.out).toEqual([]);
  });
  it('is silent and successful when the network or the server fails', async () => {
    const down = fakeIo();
    expect(await runHook(down.io, 'claude', input('SessionStart'))).toBe(0);
    expect(down.out).toEqual([]);
    expect(down.err).toEqual([]);
    expect(down.files.get(MARKER)).toBe('s1\n');
    const denied = fakeIo({ responses: [json(401, { error: 'nope' })] });
    expect(await runHook(denied.io, 'claude', input('UserPromptSubmit'))).toBe(0);
    expect(denied.out).toEqual([]);
    const garbage = fakeIo({ responses: [{ status: 200, body: 'not json' }] });
    expect(await runHook(garbage.io, 'claude', input('UserPromptSubmit'))).toBe(0);
  });
  it('sends nothing for input it does not handle', async () => {
    const fake = fakeIo();
    expect(await runHook(fake.io, 'claude', 'junk')).toBe(0);
    expect(await runHook(fake.io, 'claude', input('Stop', { agent_id: 'sub' }))).toBe(0);
    expect(fake.requests).toEqual([]);
  });
});

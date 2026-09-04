import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import {
  CHANNEL_INSTRUCTIONS,
  channelEnabled,
  channelTick,
  createChannelServer,
  runChannel,
  waitForSessionId,
} from './channel';
import { NOW, pending } from './test/board';
import { fakeIo, json } from './test/fake-io';

const config = { url: 'https://b', clientId: null, clientSecret: null };
const MARKER = '/home/gio/.bottega/state/pid/16621';

describe('createChannelServer', () => {
  it('declares the channel capability and turns notes into channel events', async () => {
    const { server, sink } = createChannelServer();
    const spy = vi.spyOn(server, 'notification').mockResolvedValue();
    await sink.push(pending({ id: 3, body: 'hello', scope: 'room', at: NOW }));
    expect(spy).toHaveBeenCalledWith({
      method: 'notifications/claude/channel',
      params: {
        content: 'hello',
        meta: { from: 'owner', scope: 'room', at: new Date(NOW).toISOString() },
      },
    });
    expect(CHANNEL_INSTRUCTIONS).toContain('owner');
  });
  it('introduces itself to the client as the bottega channel', async () => {
    const { server } = createChannelServer();
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
    expect(client.getServerVersion()).toEqual({ name: 'bottega', version: '1' });
    expect(client.getServerCapabilities()).toEqual({ experimental: { 'claude/channel': {} } });
    expect(client.getInstructions()).toBe(CHANNEL_INSTRUCTIONS);
    await client.close();
    await server.close();
  });
});

const ENABLED = { CLAUDE_PID: '16621' };
const psArgs = (args: string) => (cmd: string, a: string[]) =>
  cmd === 'ps' && a[1] === 'args='
    ? { status: 0, stdout: `${args}\n`, stderr: '' }
    : { status: 0, stdout: '', stderr: '' };
const flagged = psArgs('claude --dangerously-load-development-channels server:bottega');

describe('channelEnabled', () => {
  it('is true only when the Claude process was started with the channel', async () => {
    const on = fakeIo({ exec: flagged });
    expect(await channelEnabled(on.io, '16621')).toBe(true);
    expect(on.execs).toEqual([
      { cmd: 'ps', args: ['-o', 'args=', '-p', '16621'], timeoutMs: 3000 },
    ]);
    expect(
      await channelEnabled(fakeIo({ exec: psArgs('claude --channels plugin:telegram') }).io, '1'),
    ).toBe(false);
    expect(
      await channelEnabled(
        fakeIo({ exec: () => ({ status: 1, stdout: 'server:bottega', stderr: '' }) }).io,
        '1',
      ),
    ).toBe(false);
  });
});

describe('waitForSessionId', () => {
  it('reads the marker the hook left, polling until it appears', async () => {
    const fake = fakeIo({
      onSleep: (f) => {
        if (f.sleeps.length === 2) f.files.set(MARKER, 'sess-1\n');
      },
    });
    expect(await waitForSessionId(fake.io, '16621', 10_000)).toBe('sess-1');
    expect(fake.sleeps).toEqual([500, 500]);
  });
  it('gives up at the deadline', async () => {
    const fake = fakeIo();
    expect(await waitForSessionId(fake.io, '16621', 1000)).toBeNull();
    expect(fake.sleeps).toEqual([500, 500]);
  });
});

describe('channelTick', () => {
  it('pushes every pending note and marks it delivered through the channel', async () => {
    const fake = fakeIo({
      responses: [
        json(200, { messages: [pending({ id: 1 }), pending({ id: 2, body: 'second' })] }),
        json(200, { delivered: true }),
        json(200, { delivered: true }),
      ],
    });
    const pushed: string[] = [];
    const n = await channelTick(fake.io, config, 'sess-1', {
      push: (m) => {
        pushed.push(m.body);
        return Promise.resolve();
      },
    });
    expect(n).toBe(2);
    expect(pushed).toEqual(['run the gate', 'second']);
    expect(fake.requests.map((r) => [r.url, r.init.body])).toEqual([
      ['https://b/api/agent/pending?session=sess-1', undefined],
      [
        'https://b/api/agent/delivered',
        JSON.stringify({ messageId: 1, sessionId: 'sess-1', via: 'channel' }),
      ],
      [
        'https://b/api/agent/delivered',
        JSON.stringify({ messageId: 2, sessionId: 'sess-1', via: 'channel' }),
      ],
    ]);
  });
});

describe('runChannel', () => {
  it('connects, waits for the session, then serves passes, reporting a failure once', async () => {
    const fake = fakeIo({
      env: ENABLED,
      exec: flagged,
      files: { [MARKER]: 'sess-1' },
      responses: [
        json(200, { messages: [] }),
        new Error('down'),
        new Error('down'),
        json(200, { messages: [] }),
      ],
    });
    const connect = vi.fn(() => Promise.resolve());
    expect(
      await runChannel(fake.io, () => config, {
        intervalMs: 50,
        sessionTimeoutMs: 0,
        passes: 5,
        connect,
      }),
    ).toBe(0);
    expect(connect).toHaveBeenCalledOnce();
    expect(fake.err).toEqual([
      'bottega channel: serving session sess-1\n',
      'bottega channel: Error: down\n',
      'bottega channel: recovered\n',
      'bottega channel: Error: fetch failed\n',
    ]);
    expect(fake.sleeps).toEqual([50, 50, 50, 50, 50]);
  });
  it('stays passive in a session started without the channel flag, or without a Claude ancestor', async () => {
    const opts = {
      intervalMs: 50,
      sessionTimeoutMs: 0,
      passes: 1,
      connect: () => Promise.resolve(),
    };
    const unflagged = fakeIo({ env: ENABLED, files: { [MARKER]: 'sess-1' } });
    expect(await runChannel(unflagged.io, () => config, opts)).toBe(0);
    expect(unflagged.err).toEqual([
      'bottega channel: not enabled for this session; notes will arrive through the hook only\n',
    ]);
    const orphan = fakeIo({
      exec: () => ({ status: 1, stdout: '', stderr: '' }),
      files: { [MARKER]: 'sess-1' },
    });
    expect(await runChannel(orphan.io, () => config, opts)).toBe(0);
    expect(orphan.err).toEqual([
      'bottega channel: no Claude Code process found; notes will arrive through the hook only\n',
    ]);
    expect(unflagged.requests).toEqual([]);
    expect(orphan.requests).toEqual([]);
  });
  it('stays quiet when no marker ever appears', async () => {
    const fake = fakeIo({ env: ENABLED, exec: flagged });
    expect(
      await runChannel(fake.io, () => config, {
        intervalMs: 50,
        sessionTimeoutMs: 0,
        passes: 1,
        connect: () => Promise.resolve(),
      }),
    ).toBe(0);
    expect(fake.err).toEqual([
      'bottega channel: no session marker found; notes will arrive through the hook only\n',
    ]);
    expect(fake.requests).toEqual([]);
  });
  it('runs until told to stop when no pass count is given', async () => {
    let passes = 0;
    const fake = fakeIo({
      env: ENABLED,
      exec: flagged,
      files: { [MARKER]: 'sess-1' },
      onSleep: (f) => {
        passes += 1;
        if (passes === 2) f.io.sleep = () => Promise.reject(new Error('stop'));
      },
    });
    await expect(
      runChannel(fake.io, () => config, {
        intervalMs: 1,
        sessionTimeoutMs: 0,
        connect: () => Promise.resolve(),
      }),
    ).rejects.toThrow('stop');
    expect(passes).toBe(2);
  });
});

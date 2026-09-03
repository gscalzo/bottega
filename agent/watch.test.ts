import { describe, expect, it } from 'vitest';
import { agent, board, pending } from './test/board';
import { fakeIo, json } from './test/fake-io';
import { markDelivered, newWatchState, noteText, runWatch, watchOnce } from './watch';

const config = { url: 'https://b', clientId: null, clientSecret: null };

describe('noteText', () => {
  it('says who, how and when', () => {
    expect(noteText(pending({}))).toBe('Bottega note from the owner (direct, 10:40): run the gate');
  });
});

describe('watchOnce', () => {
  it('notifies once per agent that starts waiting, and again after it stopped', async () => {
    const waiting = agent({ id: 'w1', state: 'waiting', task: 'Ship?' });
    const fake = fakeIo({
      responses: [
        json(
          200,
          board([waiting, agent({ id: 'w2', state: 'waiting', task: null, lastReport: 'done' })]),
        ),
        json(200, { messages: [] }),
        json(200, board([waiting])),
        json(200, { messages: [] }),
        json(200, board([agent({ id: 'w1', state: 'working' })])),
        json(200, { messages: [] }),
        json(200, board([waiting])),
        json(200, { messages: [] }),
      ],
    });
    const state = newWatchState();
    await watchOnce(fake.io, config, state);
    expect(fake.execs.map((e) => e.args[1])).toEqual([
      'display notification "Ship?" with title "claude · raffaello · abcd needs you"',
      'display notification "done" with title "claude · raffaello · abcd needs you"',
    ]);
    await watchOnce(fake.io, config, state);
    expect(fake.execs).toHaveLength(2);
    await watchOnce(fake.io, config, state);
    expect(state.waiting.size).toBe(0);
    await watchOnce(fake.io, config, state);
    expect(fake.execs).toHaveLength(3);
    expect(fake.requests.map((r) => r.url)).toEqual(
      Array(4)
        .fill(['https://b/api/agent/summary', 'https://b/api/agent/pending?host=macbook'])
        .flat(),
    );
  });

  it('falls back to a generic body when the card is empty', async () => {
    const fake = fakeIo({
      responses: [
        json(200, board([agent({ state: 'waiting', task: null, lastReport: null })])),
        json(200, { messages: [] }),
      ],
    });
    await watchOnce(fake.io, config, newWatchState());
    expect(fake.execs[0]?.args[1]).toContain('"Open Bottega."');
  });

  it('queues notes into Codex sessions and marks them delivered, skipping Claude', async () => {
    const codexNote = pending({ id: 9, harness: 'codex' });
    const fake = fakeIo({
      responses: [
        json(200, board([])),
        json(200, { messages: [pending({ id: 8 }), codexNote] }),
        json(200, { delivered: true }),
      ],
    });
    await watchOnce(fake.io, config, newWatchState());
    expect(fake.execs).toEqual([
      {
        cmd: 'codex',
        args: [
          'queue',
          '--thread',
          'cdx-1',
          '--message',
          'Bottega note from the owner (direct, 10:40): run the gate',
        ],
        timeoutMs: 15000,
      },
    ]);
    expect(fake.requests[2]).toMatchObject({
      url: 'https://b/api/agent/delivered',
      init: {
        method: 'POST',
        body: JSON.stringify({ messageId: 9, sessionId: 'cdx-1', via: 'queue' }),
      },
    });
    expect(fake.out).toEqual(['bottega watch: queued note 9 into codex · raffaello · cdx-\n']);
  });

  it('leaves a note undelivered when codex refuses it', async () => {
    const fake = fakeIo({
      responses: [json(200, board([])), json(200, { messages: [pending({ harness: 'codex' })] })],
      exec: () => ({ status: 1, stdout: '', stderr: 'no rollout found\n' }),
    });
    await watchOnce(fake.io, config, newWatchState());
    expect(fake.requests).toHaveLength(2);
    expect(fake.err).toEqual([
      'bottega watch: codex queue for codex · raffaello · cdx- failed: no rollout found\n',
    ]);
  });
});

describe('markDelivered', () => {
  it('posts the delivery', async () => {
    const fake = fakeIo({ responses: [json(200, { delivered: false })] });
    expect(
      await markDelivered(fake.io, config, { messageId: 1, sessionId: 's', via: 'channel' }),
    ).toEqual({
      delivered: false,
    });
    expect(fake.requests[0]?.init.timeoutMs).toBe(8000);
  });
});

describe('runWatch', () => {
  it('runs the passes asked for, sleeping between them, reporting a failure once', async () => {
    const fake = fakeIo({
      responses: [
        json(200, board([])),
        json(200, { messages: [] }),
        new Error('down'),
        new Error('down'),
        json(200, board([])),
        json(200, { messages: [] }),
      ],
    });
    expect(await runWatch(fake.io, config, { intervalMs: 1234, passes: 5 })).toBe(0);
    expect(fake.sleeps).toEqual([1234, 1234, 1234, 1234, 1234]);
    expect(fake.out[0]).toBe('bottega watch: watching https://b for macbook\n');
    expect(fake.err).toEqual([
      'bottega watch: Error: down\n',
      'bottega watch: recovered\n',
      'bottega watch: Error: fetch failed\n',
    ]);
  });
  it('runs until told to stop when no pass count is given', async () => {
    let passes = 0;
    const fake = fakeIo({
      onSleep: (f) => {
        passes += 1;
        if (passes === 3) f.io.sleep = () => Promise.reject(new Error('stop'));
      },
    });
    await expect(runWatch(fake.io, config, { intervalMs: 1 })).rejects.toThrow('stop');
    expect(passes).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { fetchBoard, glyphs, plain, swiftBar, tone, waybar } from './status';
import { agent, board, NOW } from './test/board';
import { fakeIo, json } from './test/fake-io';

const url = 'https://b';
const busy = board([
  agent({ id: 'wait-1', state: 'waiting', stateSince: NOW - 19 * 60_000, task: 'Ship it?' }),
  agent({ id: 'work-1', state: 'working', task: null }),
  agent({ id: 'idle-1', state: 'idle', roomId: 'lobby', stateSince: NOW - 60_000 }),
]);
const empty = board([]);

describe('glyphs and tone', () => {
  it('count what deserves the eye, in order', () => {
    expect(glyphs(busy)).toBe('◆1 ●1 ○1');
    expect(glyphs(board([agent({ state: 'working' })]))).toBe('●1');
    expect(glyphs(board([agent({ state: 'online' })]))).toBe('○1');
    expect(glyphs(empty)).toBe('◇');
    expect(tone(busy)).toBe('waiting');
    expect(tone(board([agent({ state: 'working' })]))).toBe('working');
    expect(tone(board([agent({ state: 'stale' })]))).toBe('quiet');
    expect(tone(empty)).toBe('quiet');
  });
});

describe('renderers', () => {
  it('writes a SwiftBar menu with rooms, agents, tasks and links', () => {
    expect(swiftBar(busy, url)).toBe(
      [
        '◆1 ●1 ○1',
        '---',
        'One waiting for you, one at work, one idle.',
        '---',
        'raffaello | href=https://b/rooms/raffaello size=12',
        'claude wait, waiting for you since 10:22 | href=https://b/agents/wait-1',
        '--Ship it? | size=11',
        'claude work, working for 3 min | href=https://b/agents/work-1',
        '---',
        'lobby | href=https://b/rooms/lobby size=12',
        'claude idle, idle for 1 min | href=https://b/agents/idle-1',
        '--Fix the build | size=11',
        '---',
        'Open Bottega | href=https://b',
        'Refreshed 10:41 | size=11',
        '',
      ].join('\n'),
    );
    expect(swiftBar(empty, url)).toBe(
      [
        '◇',
        '---',
        'Nobody in the workshop.',
        '---',
        'Open Bottega | href=https://b',
        'Refreshed 10:41 | size=11',
        '',
      ].join('\n'),
    );
  });
  it('writes Waybar JSON with a tooltip and a class', () => {
    expect(JSON.parse(waybar(busy, url))).toEqual({
      text: '◆1 ●1 ○1',
      tooltip: [
        'One waiting for you, one at work, one idle.',
        'raffaello: claude wait, waiting for you since 10:22',
        'raffaello: claude work, working for 3 min',
        'lobby: claude idle, idle for 1 min',
        'https://b',
      ].join('\n'),
      class: 'waiting',
      alt: 'waiting',
    });
    expect(waybar(empty, url).endsWith('\n')).toBe(true);
  });
  it('writes the headline for a shell', () => {
    expect(plain(busy)).toBe('One waiting for you, one at work, one idle.\n');
  });
});

describe('fetchBoard', () => {
  it('reads the summary route', async () => {
    const fake = fakeIo({ responses: [json(200, empty)] });
    expect(await fetchBoard(fake.io, { url, clientId: null, clientSecret: null })).toEqual(empty);
    expect(fake.requests[0]).toMatchObject({
      url: 'https://b/api/agent/summary',
      init: { method: 'GET', timeoutMs: 8000 },
    });
  });
});

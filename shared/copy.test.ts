import { describe, expect, it } from 'vitest';
import {
  count,
  headline,
  hereCount,
  kindLabel,
  seenBy,
  shortId,
  stateLine,
  stateWord,
} from './copy';

const MIN = 60_000;

describe('count', () => {
  it('spells small numbers and keeps digits after ten', () => {
    expect(count(0)).toBe('no');
    expect(count(1)).toBe('one');
    expect(count(10)).toBe('ten');
    expect(count(11)).toBe('11');
  });
});

describe('headline', () => {
  it('puts whoever needs the eye first', () => {
    expect(headline({ working: 0, waiting: 0, idle: 0, stale: 0 })).toBe('Nobody in the workshop.');
    expect(headline({ working: 2, waiting: 0, idle: 0, stale: 0 })).toBe('Two at work.');
    expect(headline({ working: 2, waiting: 1, idle: 3, stale: 1 })).toBe(
      'One waiting for you, two at work, three idle, one gone quiet.',
    );
    expect(headline({ working: 0, waiting: 0, idle: 1, stale: 12 })).toBe(
      'One idle, 12 gone quiet.',
    );
  });
});

describe('stateLine', () => {
  const now = new Date(2026, 8, 3, 10, 0).getTime();
  const at = (minutesAgo: number) => now - minutesAgo * MIN;
  it('reads each state as a phrase', () => {
    expect(stateLine({ state: 'working', stateSince: at(3), lastSeen: now }, now)).toBe(
      'working for 3 min',
    );
    expect(stateLine({ state: 'waiting', stateSince: at(19), lastSeen: now }, now)).toBe(
      'waiting for you since 09:41',
    );
    expect(stateLine({ state: 'idle', stateSince: at(0), lastSeen: now }, now)).toBe(
      'idle for just now',
    );
    expect(stateLine({ state: 'online', stateSince: at(2), lastSeen: now }, now)).toBe(
      'arrived 2 min ago',
    );
    expect(stateLine({ state: 'stale', stateSince: at(90), lastSeen: at(45) }, now)).toBe(
      'quiet since 09:15',
    );
    expect(stateLine({ state: 'gone', stateSince: at(120), lastSeen: at(120) }, now)).toBe(
      'left 2 h ago',
    );
  });
});

describe('words', () => {
  it('names states, kinds, counts and readers', () => {
    expect(stateWord('waiting')).toBe('waiting for you');
    expect(stateWord('stale')).toBe('gone quiet');
    expect(stateWord('working')).toBe('working');
    expect(shortId('7f3a9c-1234')).toBe('7f3a');
    expect(kindLabel('suggest')).toBe('suggestion');
    expect(kindLabel('owner')).toBe('note');
    expect(kindLabel('done')).toBe('done');
    expect(hereCount(0)).toBe('no here');
    expect(hereCount(1)).toBe('one here');
    expect(hereCount(3)).toBe('three here');
    expect(seenBy([])).toBe('not seen yet');
    expect(seenBy(['a', 'b'])).toBe('seen by a, b');
  });
});

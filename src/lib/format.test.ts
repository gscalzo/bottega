import { describe, expect, it } from 'vitest';
import { ago, clock, duration, when } from './format';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const local = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m, d, h, min).getTime();

describe('duration', () => {
  it('picks the unit by span', () => {
    expect(duration(0)).toBe('just now');
    expect(duration(MIN - 1)).toBe('just now');
    expect(duration(MIN)).toBe('1 min');
    expect(duration(59 * MIN + 999)).toBe('59 min');
    expect(duration(HOUR)).toBe('1 h');
    expect(duration(23 * HOUR + 59 * MIN)).toBe('23 h');
    expect(duration(DAY)).toBe('1 d');
    expect(duration(3 * DAY + HOUR)).toBe('3 d');
  });
});

describe('ago', () => {
  it('appends ago except for just now, and never goes negative', () => {
    expect(ago(1000, 1000)).toBe('just now');
    expect(ago(1000, 1000 + 5 * MIN)).toBe('5 min ago');
    expect(ago(1000 + 5 * MIN, 1000)).toBe('just now');
  });
});

describe('clock', () => {
  it('pads hours and minutes', () => {
    expect(clock(local(2026, 8, 3, 9, 5))).toBe('09:05');
    expect(clock(local(2026, 8, 3, 23, 59))).toBe('23:59');
  });
});

describe('when', () => {
  const now = local(2026, 8, 3, 14, 0);
  it('is a clock today, yesterday marked, and dated otherwise', () => {
    expect(when(local(2026, 8, 3, 9, 41), now)).toBe('09:41');
    expect(when(local(2026, 8, 3, 0, 0), now)).toBe('00:00');
    expect(when(local(2026, 8, 2, 18, 2), now)).toBe('yesterday 18:02');
    expect(when(local(2026, 8, 1, 18, 2), now)).toBe('1 Sep 18:02');
    expect(when(local(2025, 11, 31, 7, 30), now)).toBe('31 Dec 07:30');
    expect(when(local(2026, 8, 3, 9, 41), local(2027, 8, 3, 14, 0))).toBe('3 Sep 09:41');
    expect(when(local(2026, 8, 3, 9, 41), local(2026, 9, 3, 14, 0))).toBe('3 Sep 09:41');
  });
});

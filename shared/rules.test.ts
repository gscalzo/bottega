import { describe, expect, it } from 'vitest';
import {
  BOARD_WINDOW_MS,
  countStates,
  deriveName,
  effectiveState,
  excerpt,
  FIXED_ROOMS,
  HEARTBEAT_EVERY_MS,
  INJECTION_LIMIT,
  isActive,
  MESSAGE_MAX_CHARS,
  nextState,
  PROMPT_EXCERPT_MAX,
  REPORT_EXCERPT_MAX,
  slugify,
  STALE_AFTER_MS,
  TASK_MIN_PROMPT_CHARS,
  taskFromPrompt,
} from './rules';
import type { AgentView } from './types';

describe('constants', () => {
  it('are the agreed numbers', () => {
    expect(STALE_AFTER_MS).toBe(30 * 60 * 1000);
    expect(HEARTBEAT_EVERY_MS).toBe(5 * 60 * 1000);
    expect(PROMPT_EXCERPT_MAX).toBe(200);
    expect(REPORT_EXCERPT_MAX).toBe(300);
    expect(TASK_MIN_PROMPT_CHARS).toBe(20);
    expect(INJECTION_LIMIT).toBe(10);
    expect(MESSAGE_MAX_CHARS).toBe(4000);
    expect(BOARD_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(FIXED_ROOMS).toEqual(['lobby', 'suggestions']);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Raffaello')).toBe('raffaello');
    expect(slugify('iOS.Blogs.Analyzer')).toBe('ios-blogs-analyzer');
    expect(slugify('  spaced  name ')).toBe('spaced-name');
    expect(slugify('--already--')).toBe('already');
  });
  it('falls back to lobby when nothing is left', () => {
    expect(slugify('')).toBe('lobby');
    expect(slugify('___')).toBe('lobby');
  });
});

describe('excerpt', () => {
  it('collapses whitespace and trims', () => {
    expect(excerpt('  a \n\n b\tc  ', 50)).toBe('a b c');
  });
  it('keeps text at exactly the limit', () => {
    expect(excerpt('abcde', 5)).toBe('abcde');
  });
  it('cuts with an ellipsis inside the limit', () => {
    const cut = excerpt('abcdefghij', 6);
    expect(cut).toBe('abcde…');
    expect(cut.length).toBe(6);
  });
  it('does not leave a trailing space before the ellipsis', () => {
    expect(excerpt('abcd efgh', 6)).toBe('abcd…');
  });
});

describe('nextState', () => {
  it('starts online and works on a prompt', () => {
    expect(nextState(undefined, 'session_start')).toBe('online');
    expect(nextState('gone', 'session_start')).toBe('online');
    expect(nextState('online', 'prompt')).toBe('working');
    expect(nextState('waiting', 'prompt')).toBe('working');
  });
  it('stops to idle unless waiting on the owner', () => {
    expect(nextState('working', 'stop')).toBe('idle');
    expect(nextState('waiting', 'stop')).toBe('waiting');
  });
  it('ends gone and heartbeats keep the state', () => {
    expect(nextState('working', 'session_end')).toBe('gone');
    expect(nextState('working', 'heartbeat')).toBe('working');
    expect(nextState('idle', 'heartbeat')).toBe('idle');
    expect(nextState(undefined, 'heartbeat')).toBe('online');
  });
});

describe('taskFromPrompt', () => {
  const long = 'please refactor the payment module and add tests';
  it('replaces a prompt-set or empty task with a meaningful prompt', () => {
    expect(taskFromPrompt({ task: null, source: null }, long)).toEqual({
      task: long,
      source: 'prompt',
    });
    expect(taskFromPrompt({ task: 'old', source: 'prompt' }, long)).toEqual({
      task: long,
      source: 'prompt',
    });
  });
  it('ignores short prompts', () => {
    expect(taskFromPrompt({ task: 'old', source: 'prompt' }, 'y')).toBeNull();
    expect(taskFromPrompt({ task: null, source: null }, 'a'.repeat(19))).toBeNull();
    expect(taskFromPrompt({ task: null, source: null }, 'a'.repeat(20))).not.toBeNull();
  });
  it('never overrides an agent-set task', () => {
    expect(taskFromPrompt({ task: 'mine', source: 'agent' }, long)).toBeNull();
  });
});

describe('effectiveState', () => {
  const now = 1_000_000_000;
  it('is gone regardless of the clock', () => {
    expect(effectiveState({ state: 'gone', last_seen: now }, now)).toBe('gone');
    expect(effectiveState({ state: 'gone', last_seen: now - STALE_AFTER_MS - 1 }, now)).toBe(
      'gone',
    );
  });
  it('is stale after the window and the stored state within it', () => {
    expect(effectiveState({ state: 'working', last_seen: now - STALE_AFTER_MS }, now)).toBe(
      'working',
    );
    expect(effectiveState({ state: 'working', last_seen: now - STALE_AFTER_MS - 1 }, now)).toBe(
      'stale',
    );
    expect(effectiveState({ state: 'idle', last_seen: now }, now)).toBe('idle');
  });
});

describe('isActive', () => {
  it('excludes gone and stale', () => {
    expect(isActive('working')).toBe(true);
    expect(isActive('waiting')).toBe(true);
    expect(isActive('idle')).toBe(true);
    expect(isActive('online')).toBe(true);
    expect(isActive('gone')).toBe(false);
    expect(isActive('stale')).toBe(false);
  });
});

describe('countStates', () => {
  const agent = (state: AgentView['state']): AgentView => ({ state }) as unknown as AgentView;
  it('buckets every state, folding online into idle and ignoring gone', () => {
    const counts = countStates([
      agent('working'),
      agent('working'),
      agent('waiting'),
      agent('idle'),
      agent('online'),
      agent('stale'),
      agent('gone'),
    ]);
    expect(counts).toEqual({ working: 2, waiting: 1, idle: 2, stale: 1 });
  });
  it('is all zeros for no agents', () => {
    expect(countStates([])).toEqual({ working: 0, waiting: 0, idle: 0, stale: 0 });
  });
});

describe('deriveName', () => {
  it('joins harness, repo and a short id', () => {
    expect(deriveName('claude', 'raffaello', '7f3a9c-abc')).toBe('claude · raffaello · 7f3a');
  });
});

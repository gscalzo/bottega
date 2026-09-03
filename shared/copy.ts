/** The words on the board, in the menu bar and in the watcher. Pure. */
import { ago, clock, duration } from './format';
import type { AgentView, BoardCounts, EffectiveState, MessageKind } from './types';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function count(n: number): string {
  return WORDS[n] ?? String(n);
}

/** The home page hero and the menu bar line: who needs the eye comes first. */
export function headline(counts: BoardCounts): string {
  const parts: string[] = [];
  if (counts.waiting > 0) parts.push(`${count(counts.waiting)} waiting for you`);
  if (counts.working > 0) parts.push(`${count(counts.working)} at work`);
  if (counts.idle > 0) parts.push(`${count(counts.idle)} idle`);
  if (counts.stale > 0) parts.push(`${count(counts.stale)} gone quiet`);
  if (parts.length === 0) return 'Nobody in the workshop.';
  const sentence = `${parts.join(', ')}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** "working for 3 min", "waiting for you since 09:41", "left 2 h ago". */
export function stateLine(
  agent: Pick<AgentView, 'state' | 'stateSince' | 'lastSeen'>,
  now: number,
): string {
  switch (agent.state) {
    case 'working':
      return `working for ${duration(now - agent.stateSince)}`;
    case 'waiting':
      return `waiting for you since ${clock(agent.stateSince)}`;
    case 'idle':
      return `idle for ${duration(now - agent.stateSince)}`;
    case 'online':
      return `arrived ${ago(agent.stateSince, now)}`;
    case 'stale':
      return `quiet since ${clock(agent.lastSeen)}`;
    case 'gone':
      return `left ${ago(agent.stateSince, now)}`;
  }
}

export function stateWord(state: EffectiveState): string {
  return state === 'waiting' ? 'waiting for you' : state === 'stale' ? 'gone quiet' : state;
}

/** The short id shown next to the harness: the first four characters. */
export function shortId(id: string): string {
  return id.slice(0, 4);
}

export function kindLabel(kind: MessageKind): string {
  const labels: Record<MessageKind, string> = {
    task: 'task',
    progress: 'progress',
    done: 'done',
    question: 'question',
    suggest: 'suggestion',
    owner: 'note',
  };
  return labels[kind];
}

export function hereCount(n: number): string {
  return `${count(n)} here`;
}

export function seenBy(names: readonly string[]): string {
  if (names.length === 0) return 'not seen yet';
  return `seen by ${names.join(', ')}`;
}

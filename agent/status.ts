/** `bottega status`: the board for a menu bar (SwiftBar, xbar), Waybar, or a shell. */
import { headline, shortId, stateLine } from '../shared/copy';
import { clock } from '../shared/format';
import type { AgentView, BoardRes } from '../shared/types';
import { call } from './api';
import type { Config } from './config';
import type { Io } from './io';

const TIMEOUT_MS = 8000;

export function fetchBoard(io: Io, config: Config): Promise<BoardRes> {
  return call<BoardRes>(io, config, {
    method: 'GET',
    path: '/api/agent/summary',
    timeoutMs: TIMEOUT_MS,
  });
}

/** "◆1 ●2 ○1": waiting, working, idle; "◇" when nobody is in. */
export function glyphs(board: BoardRes): string {
  const { waiting, working, idle } = board.counts;
  const parts: string[] = [];
  if (waiting > 0) parts.push(`◆${waiting}`);
  if (working > 0) parts.push(`●${working}`);
  if (idle > 0) parts.push(`○${idle}`);
  return parts.length === 0 ? '◇' : parts.join(' ');
}

/** The CSS class Waybar styles by: what deserves the eye most. */
export function tone(board: BoardRes): 'waiting' | 'working' | 'quiet' {
  if (board.counts.waiting > 0) return 'waiting';
  return board.counts.working > 0 ? 'working' : 'quiet';
}

function label(agent: AgentView): string {
  return `${agent.harness} ${shortId(agent.id)}`;
}

function agentLink(url: string, agent: AgentView): string {
  return `${url}/agents/${encodeURIComponent(agent.id)}`;
}

/** SwiftBar / xbar plugin output: bar line, then the dropdown. */
export function swiftBar(board: BoardRes, url: string): string {
  const lines = [glyphs(board), '---', headline(board.counts)];
  for (const room of board.rooms) {
    if (room.agents.length === 0) continue;
    lines.push('---', `${room.id} | href=${url}/rooms/${encodeURIComponent(room.id)} size=12`);
    for (const agent of room.agents) {
      lines.push(`${label(agent)}, ${stateLine(agent, board.now)} | href=${agentLink(url, agent)}`);
      if (agent.task) lines.push(`--${agent.task} | size=11`);
    }
  }
  lines.push('---', `Open Bottega | href=${url}`, `Refreshed ${clock(board.now)} | size=11`);
  return `${lines.join('\n')}\n`;
}

/** Waybar custom module output (return-type json). */
export function waybar(board: BoardRes, url: string): string {
  const agents = board.rooms.flatMap((room) =>
    room.agents.map((agent) => `${room.id}: ${label(agent)}, ${stateLine(agent, board.now)}`),
  );
  const tooltip = [headline(board.counts), ...agents, url].join('\n');
  return `${JSON.stringify({ text: glyphs(board), tooltip, class: tone(board), alt: tone(board) })}\n`;
}

export function plain(board: BoardRes): string {
  return `${headline(board.counts)}\n`;
}

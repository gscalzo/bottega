/** The whole board from the database, for the owner's page and the watcher. */
import { BOARD_WINDOW_MS } from '../shared/rules';
import type { BoardRes } from '../shared/types';
import { countOpenSuggestions, latestMessageAtByRoom, listAgentsSince, listRooms } from './db';
import { buildBoard } from './views';

export async function loadBoard(db: D1Database, at: number): Promise<BoardRes> {
  const [rooms, agents, lastMessageAt, open] = await Promise.all([
    listRooms(db),
    listAgentsSince(db, at - BOARD_WINDOW_MS),
    latestMessageAtByRoom(db),
    countOpenSuggestions(db),
  ]);
  return buildBoard(rooms, agents, lastMessageAt, at, open);
}

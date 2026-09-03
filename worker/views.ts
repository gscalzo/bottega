/** Rows → API views, and the board's ordering. Pure. */
import { BOARD_WINDOW_MS, countStates, effectiveState, isActive } from '../shared/rules';
import type {
  AgentRow,
  AgentView,
  BoardRes,
  EffectiveState,
  EventView,
  MessageAuthor,
  MessageView,
  PendingMessage,
  RoomView,
} from '../shared/types';
import type { DeliveryRow, EventRow, MessageRow, NewMessage, PendingRow, RoomRow } from './db';

export function agentView(row: AgentRow, now: number): AgentView {
  return {
    id: row.id,
    harness: row.harness,
    roomId: row.room_id,
    name: row.name,
    host: row.host,
    cwd: row.cwd,
    model: row.model,
    state: effectiveState(row, now),
    stateSince: row.state_since,
    task: row.task,
    taskSource: row.task_source,
    lastReport: row.last_report,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

function messageView(row: MessageRow, deliveries: readonly DeliveryRow[]): MessageView {
  return {
    id: row.id,
    at: row.at,
    roomId: row.room_id,
    kind: row.kind,
    body: row.body,
    author:
      row.agent_id === null
        ? { type: 'owner' }
        : { type: 'agent', id: row.agent_id, name: row.author_name ?? row.agent_id },
    toAgentId: row.to_agent_id,
    handled: row.handled !== 0,
    deliveredTo: deliveries
      .filter((d) => d.message_id === row.id)
      .map((d) => ({ agentId: d.agent_id, agentName: d.agent_name, at: d.at, via: d.via })),
  };
}

export function messageViews(rows: readonly MessageRow[], deliveries: readonly DeliveryRow[]) {
  return rows.map((row) => messageView(row, deliveries));
}

/** The view of a message just written: nothing delivered, nothing handled. */
export function newMessageView(id: number, m: NewMessage, author: MessageAuthor): MessageView {
  return {
    id,
    at: m.at,
    roomId: m.room_id,
    kind: m.kind,
    body: m.body,
    author,
    toAgentId: m.to_agent_id,
    handled: false,
    deliveredTo: [],
  };
}

export function pendingView(row: PendingRow): PendingMessage {
  return {
    id: row.id,
    at: row.at,
    body: row.body,
    scope: row.to_agent_id === null ? 'room' : 'direct',
    agent: { id: row.agent_id, harness: row.harness, roomId: row.room_id, name: row.name },
  };
}

export function eventView(row: EventRow): EventView {
  return { id: row.id, at: row.at, event: row.event, excerpt: row.excerpt };
}

/** Who needs the eye first: waiting, then working, idle, online, stale, gone. */
const STATE_RANK: Record<EffectiveState, number> = {
  waiting: 0,
  working: 1,
  idle: 2,
  online: 3,
  stale: 4,
  gone: 5,
};

export function compareAgents(a: AgentView, b: AgentView): number {
  return STATE_RANK[a.state] - STATE_RANK[b.state] || b.lastSeen - a.lastSeen;
}

function activeCount(room: RoomView): number {
  return room.agents.filter((a) => isActive(a.state)).length;
}

/** Busiest first, then most recently alive, then by name. */
export function compareRooms(a: RoomView, b: RoomView): number {
  return (
    activeCount(b) - activeCount(a) ||
    (b.lastActivity ?? 0) - (a.lastActivity ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

function roomActivity(agents: readonly AgentView[], lastMessageAt: number | undefined) {
  const seen = agents.map((a) => a.lastSeen);
  const all = lastMessageAt === undefined ? seen : [...seen, lastMessageAt];
  return all.length === 0 ? null : Math.max(...all);
}

export function buildBoard(
  rooms: readonly RoomRow[],
  agents: readonly AgentRow[],
  lastMessageAt: ReadonlyMap<string, number>,
  now: number,
  openSuggestions: number,
): BoardRes {
  const views = agents
    .filter((row) => row.last_seen >= now - BOARD_WINDOW_MS)
    .map((row) => agentView(row, now));
  const roomViews = rooms
    .map((room): RoomView => {
      const members = views.filter((a) => a.roomId === room.id).sort(compareAgents);
      return {
        id: room.id,
        kind: room.kind,
        agents: members,
        lastActivity: roomActivity(members, lastMessageAt.get(room.id)),
      };
    })
    .sort(compareRooms);
  return { now, counts: countStates(views), rooms: roomViews, openSuggestions };
}

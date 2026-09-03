/**
 * Every SQL statement the Worker runs, typed at the edges. Routes never
 * touch D1 directly, so the schema (migrations/) has exactly one client.
 */
import type {
  AgentRow,
  DeliveryVia,
  Harness,
  HookEvent,
  MessageKind,
  RoomKind,
} from '../shared/types';

export interface RoomRow {
  id: string;
  kind: RoomKind;
  created_at: number;
}

export interface MessageRow {
  id: number;
  at: number;
  room_id: string;
  agent_id: string | null;
  to_agent_id: string | null;
  kind: MessageKind;
  body: string;
  handled: number;
  /** Joined from agents.name; null for the owner's messages. */
  author_name: string | null;
}

export interface EventRow {
  id: number;
  at: number;
  event: HookEvent;
  excerpt: string | null;
}

export interface DeliveryRow {
  message_id: number;
  agent_id: string;
  agent_name: string;
  at: number;
  via: DeliveryVia;
}

export interface PendingRow {
  id: number;
  at: number;
  body: string;
  to_agent_id: string | null;
  agent_id: string;
  harness: Harness;
  room_id: string;
  name: string;
}

export interface UndeliveredRow {
  id: number;
  at: number;
  body: string;
  to_agent_id: string | null;
}

export interface NewMessage {
  at: number;
  room_id: string;
  agent_id: string | null;
  to_agent_id: string | null;
  kind: MessageKind;
  body: string;
}

const MESSAGE_SELECT = `SELECT m.id, m.at, m.room_id, m.agent_id, m.to_agent_id, m.kind, m.body, m.handled,
  a.name AS author_name FROM messages m LEFT JOIN agents a ON a.id = m.agent_id`;

export async function getRoom(db: D1Database, id: string): Promise<RoomRow | null> {
  return db
    .prepare('SELECT id, kind, created_at FROM rooms WHERE id = ?')
    .bind(id)
    .first<RoomRow>();
}

export async function listRooms(db: D1Database): Promise<RoomRow[]> {
  const { results } = await db.prepare('SELECT id, kind, created_at FROM rooms').all<RoomRow>();
  return results;
}

export async function ensureRoom(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO rooms (id, kind, created_at) VALUES (?, 'repo', ?)")
    .bind(id, now)
    .run();
}

export async function getAgent(db: D1Database, id: string): Promise<AgentRow | null> {
  return db.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first<AgentRow>();
}

export async function listAgentsSince(db: D1Database, since: number): Promise<AgentRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM agents WHERE last_seen >= ? ORDER BY last_seen DESC')
    .bind(since)
    .all<AgentRow>();
  return results;
}

export async function listRoomAgentsSince(
  db: D1Database,
  roomId: string,
  since: number,
): Promise<AgentRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM agents WHERE room_id = ? AND last_seen >= ? ORDER BY last_seen DESC')
    .bind(roomId, since)
    .all<AgentRow>();
  return results;
}

export async function insertAgent(db: D1Database, row: AgentRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agents (id, harness, room_id, name, host, cwd, model, state, state_since,
        task, task_source, last_report, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.harness,
      row.room_id,
      row.name,
      row.host,
      row.cwd,
      row.model,
      row.state,
      row.state_since,
      row.task,
      row.task_source,
      row.last_report,
      row.first_seen,
      row.last_seen,
    )
    .run();
}

export async function updateAgent(db: D1Database, row: AgentRow): Promise<void> {
  await db
    .prepare(
      `UPDATE agents SET room_id = ?, name = ?, host = ?, cwd = ?, model = ?, state = ?,
        state_since = ?, task = ?, task_source = ?, last_report = ?, last_seen = ?
       WHERE id = ?`,
    )
    .bind(
      row.room_id,
      row.name,
      row.host,
      row.cwd,
      row.model,
      row.state,
      row.state_since,
      row.task,
      row.task_source,
      row.last_report,
      row.last_seen,
      row.id,
    )
    .run();
}

export async function insertEvent(
  db: D1Database,
  agentId: string,
  at: number,
  event: HookEvent,
  excerpt: string | null,
): Promise<void> {
  await db
    .prepare('INSERT INTO events (agent_id, at, event, excerpt) VALUES (?, ?, ?, ?)')
    .bind(agentId, at, event, excerpt)
    .run();
}

export async function listAgentEvents(
  db: D1Database,
  agentId: string,
  limit: number,
): Promise<EventRow[]> {
  const { results } = await db
    .prepare(
      'SELECT id, at, event, excerpt FROM events WHERE agent_id = ? ORDER BY id DESC LIMIT ?',
    )
    .bind(agentId, limit)
    .all<EventRow>();
  return results;
}

export async function insertMessage(db: D1Database, m: NewMessage): Promise<number> {
  const { meta } = await db
    .prepare(
      'INSERT INTO messages (at, room_id, agent_id, to_agent_id, kind, body) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(m.at, m.room_id, m.agent_id, m.to_agent_id, m.kind, m.body)
    .run();
  return meta.last_row_id;
}

export async function listRoomMessages(
  db: D1Database,
  roomId: string,
  limit: number,
): Promise<MessageRow[]> {
  const { results } = await db
    .prepare(`${MESSAGE_SELECT} WHERE m.room_id = ? ORDER BY m.id DESC LIMIT ?`)
    .bind(roomId, limit)
    .all<MessageRow>();
  return results;
}

export async function listAgentMessages(
  db: D1Database,
  agentId: string,
  limit: number,
): Promise<MessageRow[]> {
  const { results } = await db
    .prepare(
      `${MESSAGE_SELECT} WHERE m.agent_id = ?1 OR m.to_agent_id = ?1 ORDER BY m.id DESC LIMIT ?2`,
    )
    .bind(agentId, limit)
    .all<MessageRow>();
  return results;
}

/** Sets `handled` on a suggestion; false when there is no such suggestion. */
export async function setHandled(db: D1Database, id: number, handled: boolean): Promise<boolean> {
  const { meta } = await db
    .prepare("UPDATE messages SET handled = ? WHERE id = ? AND kind = 'suggest'")
    .bind(handled ? 1 : 0, id)
    .run();
  return meta.changes > 0;
}

export async function listDeliveries(
  db: D1Database,
  messageIds: readonly number[],
): Promise<DeliveryRow[]> {
  // SQLite accepts `IN ()`, so an empty list needs no special case.
  const placeholders = messageIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT d.message_id, d.agent_id, a.name AS agent_name, d.at, d.via FROM deliveries d
       JOIN agents a ON a.id = d.agent_id WHERE d.message_id IN (${placeholders}) ORDER BY d.at`,
    )
    .bind(...messageIds)
    .all<DeliveryRow>();
  return results;
}

/**
 * The owner's messages this agent has not received yet (ADR-0007): direct
 * ones, plus room ones posted while the agent already existed.
 */
export async function listUndelivered(
  db: D1Database,
  agent: Pick<AgentRow, 'id' | 'room_id' | 'first_seen'>,
  limit: number,
): Promise<UndeliveredRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.at, m.body, m.to_agent_id FROM messages m
       WHERE m.kind = 'owner'
         AND (m.to_agent_id = ?1 OR (m.to_agent_id IS NULL AND m.room_id = ?2 AND m.at >= ?3))
         AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id = m.id AND d.agent_id = ?1)
       ORDER BY m.id LIMIT ?4`,
    )
    .bind(agent.id, agent.room_id, agent.first_seen, limit)
    .all<UndeliveredRow>();
  return results;
}

export async function recordDeliveries(
  db: D1Database,
  messageIds: readonly number[],
  agentId: string,
  at: number,
): Promise<void> {
  // Stryker disable next-line ConditionalExpression: D1 rejects an empty batch; the test fake does not
  if (messageIds.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO deliveries (message_id, agent_id, at, via) VALUES (?, ?, ?, 'hook')",
  );
  await db.batch(messageIds.map((id) => stmt.bind(id, agentId, at)));
}

/** One delivery by the watcher or the channel; false when already recorded. */
export async function recordDelivery(
  db: D1Database,
  messageId: number,
  agentId: string,
  at: number,
  via: DeliveryVia,
): Promise<boolean> {
  const { meta } = await db
    .prepare('INSERT OR IGNORE INTO deliveries (message_id, agent_id, at, via) VALUES (?, ?, ?, ?)')
    .bind(messageId, agentId, at, via)
    .run();
  return meta.changes > 0;
}

const PENDING_SELECT = `SELECT m.id, m.at, m.body, m.to_agent_id, a.id AS agent_id, a.harness, a.room_id, a.name
  FROM agents a
  JOIN messages m ON m.kind = 'owner'
   AND (m.to_agent_id = a.id OR (m.to_agent_id IS NULL AND m.room_id = a.room_id AND m.at >= a.first_seen))
  WHERE a.state != 'gone'
    AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.message_id = m.id AND d.agent_id = a.id)`;

/** Undelivered owner notes for every live agent on a host (the watcher, ADR-0015). */
export async function listPendingForHost(
  db: D1Database,
  host: string,
  since: number,
  limit: number,
): Promise<PendingRow[]> {
  const { results } = await db
    .prepare(`${PENDING_SELECT} AND a.host = ? AND a.last_seen >= ? ORDER BY m.id LIMIT ?`)
    .bind(host, since, limit)
    .all<PendingRow>();
  return results;
}

/** Undelivered owner notes for one session (the channel, ADR-0015). */
export async function listPendingForSession(
  db: D1Database,
  sessionId: string,
  limit: number,
): Promise<PendingRow[]> {
  const { results } = await db
    .prepare(`${PENDING_SELECT} AND a.id = ? ORDER BY m.id LIMIT ?`)
    .bind(sessionId, limit)
    .all<PendingRow>();
  return results;
}

export async function countOpenSuggestions(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE kind = 'suggest' AND handled = 0")
    .all<{ n: number }>();
  return results[0].n;
}

export async function latestMessageAtByRoom(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db
    .prepare('SELECT room_id, MAX(at) AS at FROM messages GROUP BY room_id')
    .all<{ room_id: string; at: number }>();
  return new Map(results.map((r) => [r.room_id, r.at]));
}

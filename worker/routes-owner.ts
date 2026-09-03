/**
 * What the board calls: reads of the whole board, a room or an agent, and
 * the owner's two writes — a message (ADR-0007) and the handled flag on a
 * suggestion.
 */
import type { Context, Hono } from 'hono';
import { BOARD_WINDOW_MS, MESSAGE_MAX_CHARS } from '../shared/rules';
import type { AgentRes, HandledReq, MessageView, NoteTarget, RoomRes } from '../shared/types';
import { requireOwner } from './access';
import type { AppContext, Clock } from './app';
import { readBody } from './body';
import type { Body } from './body';
import type { MessageRow, NewMessage } from './db';
import {
  countOpenSuggestions,
  getAgent,
  getRoom,
  insertMessage,
  latestMessageAtByRoom,
  listAgentEvents,
  listAgentMessages,
  listAgentsSince,
  listDeliveries,
  listRoomAgentsSince,
  listRoomMessages,
  listRooms,
  setHandled,
} from './db';
import {
  agentView,
  buildBoard,
  compareAgents,
  eventView,
  messageViews,
  newMessageView,
} from './views';

type Ctx = Context<AppContext>;
type IdCtx = Context<AppContext, '/:id'>;

const PAGE = 200;

async function withDeliveries(db: D1Database, rows: MessageRow[]): Promise<MessageView[]> {
  return messageViews(
    rows,
    await listDeliveries(
      db,
      rows.map((r) => r.id),
    ),
  );
}

async function board(c: Ctx, now: Clock) {
  const db = c.env.DB;
  const at = now();
  const [rooms, agents, lastMessageAt, open] = await Promise.all([
    listRooms(db),
    listAgentsSince(db, at - BOARD_WINDOW_MS),
    latestMessageAtByRoom(db),
    countOpenSuggestions(db),
  ]);
  return c.json(buildBoard(rooms, agents, lastMessageAt, at, open));
}

async function room(c: IdCtx, now: Clock) {
  const db = c.env.DB;
  const id = c.req.param('id');
  const found = await getRoom(db, id);
  if (!found) return c.json({ error: 'room not found' }, 404);
  const at = now();
  const agents = (await listRoomAgentsSince(db, id, at - BOARD_WINDOW_MS))
    .map((a) => agentView(a, at))
    .sort(compareAgents);
  const res: RoomRes = {
    room: { id: found.id, kind: found.kind },
    agents,
    messages: await withDeliveries(db, await listRoomMessages(db, id, PAGE)),
  };
  return c.json(res);
}

async function agent(c: IdCtx, now: Clock) {
  const db = c.env.DB;
  const id = c.req.param('id');
  const found = await getAgent(db, id);
  if (!found) return c.json({ error: 'agent not found' }, 404);
  const [events, messages] = await Promise.all([
    listAgentEvents(db, id, PAGE),
    listAgentMessages(db, id, PAGE),
  ]);
  const res: AgentRes = {
    agent: agentView(found, now()),
    events: events.map(eventView),
    messages: await withDeliveries(db, messages),
  };
  return c.json(res);
}

interface OwnerMessage {
  target: NoteTarget;
  body: string;
}

/** A non-empty body and exactly one of roomId / toAgentId. */
function parseOwnerMessage(body: Body): OwnerMessage | null {
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text === '' || text.length > MESSAGE_MAX_CHARS) return null;
  const { roomId, toAgentId } = body;
  if (typeof roomId === 'string' && toAgentId === undefined) {
    return { target: { roomId }, body: text };
  }
  if (typeof toAgentId === 'string' && roomId === undefined) {
    return { target: { toAgentId }, body: text };
  }
  return null;
}

/** The room a message lands in, or a 404 reason. */
async function resolveTarget(
  db: D1Database,
  target: NoteTarget,
): Promise<{ roomId: string } | { error: string }> {
  if ('toAgentId' in target) {
    const agent = await getAgent(db, target.toAgentId);
    return agent ? { roomId: agent.room_id } : { error: 'agent not found' };
  }
  const found = await getRoom(db, target.roomId);
  return found ? { roomId: found.id } : { error: 'room not found' };
}

async function postMessage(c: Ctx, now: Clock) {
  const body = await readBody(c);
  const req = body && parseOwnerMessage(body);
  if (!req) return c.json({ error: 'a non-empty body and exactly one of roomId / toAgentId' }, 400);
  const db = c.env.DB;
  const target = await resolveTarget(db, req.target);
  if ('error' in target) return c.json({ error: target.error }, 404);
  const message: NewMessage = {
    at: now(),
    room_id: target.roomId,
    agent_id: null,
    to_agent_id: 'toAgentId' in req.target ? req.target.toAgentId : null,
    kind: 'owner',
    body: req.body,
  };
  const id = await insertMessage(db, message);
  return c.json({ message: newMessageView(id, message, { type: 'owner' }) }, 201);
}

async function markHandled(c: IdCtx) {
  const body = await readBody(c);
  if (!body || typeof body.handled !== 'boolean') {
    return c.json({ error: 'handled must be a boolean' }, 400);
  }
  const id = Number(c.req.param('id'));
  const req: HandledReq = { handled: body.handled };
  const ok = Number.isInteger(id) && (await setHandled(c.env.DB, id, req.handled));
  if (!ok) return c.json({ error: 'suggestion not found' }, 404);
  return c.json({ id, handled: req.handled });
}

export function registerOwnerRoutes(app: Hono<AppContext>, now: Clock): void {
  app.use('/board', requireOwner);
  app.use('/rooms/*', requireOwner);
  app.use('/agents/*', requireOwner);
  app.use('/messages/*', requireOwner);
  app.get('/board', (c) => board(c, now));
  app.get('/rooms/:id', (c) => room(c, now));
  app.get('/agents/:id', (c) => agent(c, now));
  app.post('/messages', (c) => postMessage(c, now));
  app.post('/messages/:id/handled', (c) => markHandled(c));
}

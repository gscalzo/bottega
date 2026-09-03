/**
 * What agents call: the hook (`POST /agent/events`) and the skill
 * (`POST /agent/messages`). See shared/types.ts for the shapes and ADR-0003,
 * ADR-0005, ADR-0006, ADR-0007 for the rules applied here.
 */
import type { Context, Hono } from 'hono';
import {
  deriveName,
  excerpt,
  INJECTION_LIMIT,
  MESSAGE_MAX_CHARS,
  nextState,
  PROMPT_EXCERPT_MAX,
  REPORT_EXCERPT_MAX,
  slugify,
  taskFromPrompt,
} from '../shared/rules';
import type {
  AgentEventReq,
  AgentEventRes,
  AgentMessageKind,
  AgentPostReq,
  AgentPostRes,
  AgentRow,
  DeliveredMessage,
  HookEvent,
  SessionInfo,
} from '../shared/types';
import { requireAgent } from './access';
import type { AppContext, Clock } from './app';
import { readBody } from './body';
import type { Body } from './body';
import {
  ensureRoom,
  getAgent,
  insertAgent,
  insertEvent,
  insertMessage,
  listUndelivered,
  recordDeliveries,
  updateAgent,
} from './db';
import type { NewMessage } from './db';
import { agentView, newMessageView } from './views';

type Ctx = Context<AppContext>;

const HOOK_EVENTS: ReadonlySet<string> = new Set([
  'session_start',
  'prompt',
  'heartbeat',
  'stop',
  'session_end',
]);
const MESSAGE_KINDS: ReadonlySet<string> = new Set([
  'task',
  'progress',
  'done',
  'question',
  'suggest',
]);
const HARNESSES: ReadonlySet<string> = new Set(['claude', 'codex']);

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

const isOptStr = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || typeof v === 'string';

function sessionShape(raw: unknown): Body | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Body;
  const ok =
    [s.id, s.host, s.cwd, s.repo].every(isStr) &&
    isStr(s.harness) &&
    HARNESSES.has(s.harness) &&
    isOptStr(s.model);
  return ok ? s : null;
}

function parseSession(raw: unknown): SessionInfo | null {
  const s = sessionShape(raw);
  if (!s) return null;
  return {
    id: s.id as string,
    harness: s.harness as SessionInfo['harness'],
    host: s.host as string,
    cwd: s.cwd as string,
    repo: slugify(s.repo as string),
    model: typeof s.model === 'string' ? s.model : null,
  };
}

function parseEventReq(body: Body): AgentEventReq | null {
  const session = parseSession(body.session);
  const event = isStr(body.event) && HOOK_EVENTS.has(body.event);
  if (!session || !event || !isOptStr(body.excerpt)) return null;
  return {
    event: body.event as HookEvent,
    session,
    excerpt: body.excerpt ?? null,
  };
}

function freshAgent(s: SessionInfo, state: AgentRow['state'], now: number): AgentRow {
  return {
    id: s.id,
    harness: s.harness,
    room_id: s.repo,
    name: deriveName(s.harness, s.repo, s.id),
    host: s.host,
    cwd: s.cwd,
    model: s.model,
    state,
    state_since: now,
    task: null,
    task_source: null,
    last_report: null,
    first_seen: now,
    last_seen: now,
  };
}

/** The agent row after this event (ADR-0005), plus what the event's row records. */
function applyEvent(
  existing: AgentRow | null,
  req: AgentEventReq,
  now: number,
): { row: AgentRow; stored: string | null } {
  const state = nextState(existing?.state, req.event);
  const row: AgentRow = existing
    ? {
        ...existing,
        room_id: req.session.repo,
        name: deriveName(req.session.harness, req.session.repo, req.session.id),
        host: req.session.host,
        cwd: req.session.cwd,
        // Only SessionStart reliably carries the model; a silent event keeps it.
        model: req.session.model ?? existing.model,
        state,
        state_since: state === existing.state ? existing.state_since : now,
        last_seen: now,
      }
    : freshAgent(req.session, state, now);
  return { row, stored: applyExcerpt(row, req) };
}

/** ADR-0006: a prompt may set the task line, a stop sets the last report. */
function applyExcerpt(row: AgentRow, req: AgentEventReq): string | null {
  if (!req.excerpt) return null;
  if (req.event === 'prompt') {
    const text = excerpt(req.excerpt, PROMPT_EXCERPT_MAX);
    const task = taskFromPrompt({ task: row.task, source: row.task_source }, text);
    if (task) {
      row.task = task.task;
      row.task_source = task.source;
    }
    return text;
  }
  if (req.event === 'stop') {
    const text = excerpt(req.excerpt, REPORT_EXCERPT_MAX);
    row.last_report = text;
    return text;
  }
  return null;
}

async function deliver(db: D1Database, row: AgentRow, now: number): Promise<DeliveredMessage[]> {
  const pending = await listUndelivered(db, row, INJECTION_LIMIT);
  await recordDeliveries(
    db,
    pending.map((m) => m.id),
    row.id,
    now,
  );
  return pending.map((m) => ({
    id: m.id,
    at: m.at,
    body: m.body,
    scope: m.to_agent_id === null ? 'room' : 'direct',
  }));
}

async function handleEvent(c: Ctx, now: Clock) {
  const body = await readBody(c);
  const req = body && parseEventReq(body);
  if (!req) return c.json({ error: 'invalid event' }, 400);
  const db = c.env.DB;
  const at = now();
  await ensureRoom(db, req.session.repo, at);
  const existing = await getAgent(db, req.session.id);
  const { row, stored } = applyEvent(existing, req, at);
  await (existing ? updateAgent(db, row) : insertAgent(db, row));
  await insertEvent(db, row.id, at, req.event, stored);
  const delivers = req.event === 'session_start' || req.event === 'prompt';
  const messages = delivers ? await deliver(db, row, at) : [];
  const res: AgentEventRes = { agent: agentView(row, at), messages };
  return c.json(res);
}

function parsePostReq(body: Body): AgentPostReq | null {
  const kind = isStr(body.kind) && MESSAGE_KINDS.has(body.kind);
  const text = isStr(body.body) && body.body.length <= MESSAGE_MAX_CHARS;
  if (!isStr(body.sessionId) || !kind || !text) return null;
  return {
    sessionId: body.sessionId,
    kind: body.kind as AgentMessageKind,
    body: (body.body as string).trim(),
  };
}

/** What a deliberate post does to the agent's card (ADR-0003). */
function applyPost(agent: AgentRow, req: AgentPostReq, now: number): AgentRow {
  const row = { ...agent, last_seen: now };
  if (req.kind === 'task') {
    row.task = excerpt(req.body, PROMPT_EXCERPT_MAX);
    row.task_source = 'agent';
  } else if (req.kind === 'question') {
    row.state = 'waiting';
    row.state_since = now;
  } else if (req.kind !== 'suggest') {
    row.last_report = excerpt(req.body, REPORT_EXCERPT_MAX);
  }
  return row;
}

async function handlePost(c: Ctx, now: Clock) {
  const body = await readBody(c);
  const req = body && parsePostReq(body);
  if (!req) return c.json({ error: 'invalid message' }, 400);
  const db = c.env.DB;
  const agent = await getAgent(db, req.sessionId);
  if (!agent) return c.json({ error: 'agent not found — has the SessionStart hook run?' }, 404);
  const at = now();
  const row = applyPost(agent, req, at);
  await updateAgent(db, row);
  const message: NewMessage = {
    at,
    room_id: req.kind === 'suggest' ? 'suggestions' : agent.room_id,
    agent_id: agent.id,
    to_agent_id: null,
    kind: req.kind,
    body: req.body,
  };
  const id = await insertMessage(db, message);
  const res: AgentPostRes = {
    message: newMessageView(id, message, { type: 'agent', id: agent.id, name: agent.name }),
    agent: agentView(row, at),
  };
  return c.json(res, 201);
}

export function registerAgentRoutes(app: Hono<AppContext>, now: Clock): void {
  app.use('/agent/*', requireAgent);
  app.post('/agent/events', (c) => handleEvent(c, now));
  app.post('/agent/messages', (c) => handlePost(c, now));
}

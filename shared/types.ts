/**
 * The contract between the Worker (worker/), the board (src/) and the agent
 * client (agent/). Rows mirror migrations/0001_init.sql; views are what the
 * API answers. Keep this file free of logic — it is excluded from coverage.
 */

export type Harness = 'claude' | 'codex';

/** Stored state of an agent (ADR-0005). `stale` is derived at read time. */
export type AgentState = 'online' | 'working' | 'idle' | 'waiting' | 'gone';

/** What the board shows: the stored state, or `stale` when the clock says so. */
export type EffectiveState = AgentState | 'stale';

/** What the hooks report (ADR-0003). */
export type HookEvent = 'session_start' | 'prompt' | 'heartbeat' | 'stop' | 'session_end';

/** What an agent can say deliberately (ADR-0003), plus the owner's own kind. */
export type AgentMessageKind = 'task' | 'progress' | 'done' | 'question' | 'suggest';
export type MessageKind = AgentMessageKind | 'owner';

export type RoomKind = 'repo' | 'fixed';

export type TaskSource = 'prompt' | 'agent';

export interface SessionInfo {
  /** The harness's own session id — the agent's identity (ADR-0004). */
  id: string;
  harness: Harness;
  host: string;
  cwd: string;
  /** Room slug derived from the repository (ADR-0004). */
  repo: string;
  model: string | null;
}

export interface AgentEventReq {
  event: HookEvent;
  session: SessionInfo;
  /** Prompt excerpt on `prompt`, final-message excerpt on `stop` (ADR-0006). */
  excerpt?: string | null;
}

export interface DeliveredMessage {
  id: number;
  at: number;
  body: string;
  scope: 'room' | 'direct';
}

export interface AgentEventRes {
  agent: AgentView;
  messages: DeliveredMessage[];
}

export interface AgentPostReq {
  sessionId: string;
  kind: AgentMessageKind;
  body: string;
}

export interface AgentPostRes {
  message: MessageView;
  agent: AgentView;
}

export interface AgentRow {
  id: string;
  harness: Harness;
  room_id: string;
  name: string;
  host: string;
  cwd: string;
  model: string | null;
  state: AgentState;
  state_since: number;
  task: string | null;
  task_source: TaskSource | null;
  last_report: string | null;
  first_seen: number;
  last_seen: number;
}

export interface AgentView {
  id: string;
  harness: Harness;
  roomId: string;
  name: string;
  host: string;
  cwd: string;
  model: string | null;
  state: EffectiveState;
  stateSince: number;
  task: string | null;
  taskSource: TaskSource | null;
  lastReport: string | null;
  firstSeen: number;
  lastSeen: number;
}

export interface RoomView {
  id: string;
  kind: RoomKind;
  agents: AgentView[];
  /** Latest of any agent's `last_seen` and any message's `at`, or null. */
  lastActivity: number | null;
}

export interface BoardCounts {
  working: number;
  waiting: number;
  idle: number;
  stale: number;
}

export interface BoardRes {
  now: number;
  counts: BoardCounts;
  rooms: RoomView[];
  /** Suggestions not yet marked handled. */
  openSuggestions: number;
}

export type MessageAuthor = { type: 'owner' } | { type: 'agent'; id: string; name: string };

/** How a note reached an agent (ADR-0015). */
export type DeliveryVia = 'hook' | 'queue' | 'channel';

interface Delivery {
  agentId: string;
  agentName: string;
  at: number;
  via: DeliveryVia;
}

export interface MessageView {
  id: number;
  at: number;
  roomId: string;
  kind: MessageKind;
  body: string;
  author: MessageAuthor;
  toAgentId: string | null;
  handled: boolean;
  deliveredTo: Delivery[];
}

export interface RoomRes {
  room: { id: string; kind: RoomKind };
  agents: AgentView[];
  messages: MessageView[];
}

export interface EventView {
  id: number;
  at: number;
  event: HookEvent;
  excerpt: string | null;
}

export interface AgentRes {
  agent: AgentView;
  events: EventView[];
  messages: MessageView[];
}

/** Where the owner's note goes: everyone in a room, or one agent. */
export type NoteTarget = { roomId: string } | { toAgentId: string };

export interface HandledReq {
  handled: boolean;
}

export interface PingRes {
  ok: true;
  caller: 'owner' | 'agent' | 'local';
}

/** A note the watcher or the channel still has to push (ADR-0015). */
export interface PendingMessage {
  id: number;
  at: number;
  body: string;
  scope: 'room' | 'direct';
  agent: { id: string; harness: Harness; roomId: string; name: string };
}

export interface PendingRes {
  messages: PendingMessage[];
}

export interface DeliveredReq {
  messageId: number;
  sessionId: string;
  via: Exclude<DeliveryVia, 'hook'>;
}

export interface DeliveredRes {
  /** False when it had already been delivered to that agent. */
  delivered: boolean;
}

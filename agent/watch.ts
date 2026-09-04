/**
 * The watcher (ADR-0015): one per machine, zero tokens. Every few seconds it
 * reads the board, raises a native notification when an agent starts
 * waiting for the owner, and queues the owner's undelivered notes into idle
 * Codex sessions with `codex queue`. Claude Code sessions are served by the
 * channel instead (channel.ts).
 */
import { clock } from '../shared/format';
import type { DeliveredReq, DeliveredRes, PendingMessage, PendingRes } from '../shared/types';
import { call } from './api';
import type { Config } from './config';
import type { Io } from './io';
import { notify } from './notify';
import { ErrorOnce } from './report';
import { fetchBoard } from './status';

const TIMEOUT_MS = 8000;
const QUEUE_TIMEOUT_MS = 15000;

export interface WatchState {
  /** Agents already notified as waiting; cleared when they stop waiting. */
  waiting: Set<string>;
}

export function newWatchState(): WatchState {
  return { waiting: new Set() };
}

/** What the agent reads when a note is queued or pushed. */
export function noteText(m: PendingMessage): string {
  return `Bottega note from the owner (${m.scope}, ${clock(m.at)}): ${m.body}`;
}

export async function markDelivered(
  io: Io,
  config: Config,
  req: DeliveredReq,
): Promise<DeliveredRes> {
  return call<DeliveredRes>(io, config, {
    method: 'POST',
    path: '/api/agent/delivered',
    body: req,
    timeoutMs: TIMEOUT_MS,
  });
}

async function notifyWaiting(io: Io, config: Config, state: WatchState): Promise<void> {
  const board = await fetchBoard(io, config);
  const nowWaiting = board.rooms.flatMap((r) => r.agents.filter((a) => a.state === 'waiting'));
  for (const agent of nowWaiting) {
    if (state.waiting.has(agent.id)) continue;
    await notify(io, `${agent.name} needs you`, agent.task ?? agent.lastReport ?? 'Open Bottega.');
  }
  state.waiting = new Set(nowWaiting.map((a) => a.id));
}

async function queueIntoCodex(io: Io, config: Config, m: PendingMessage): Promise<void> {
  const args = ['queue', '--thread', m.agent.id, '--message', noteText(m)];
  const { status, stderr } = await io.exec('codex', args, QUEUE_TIMEOUT_MS);
  if (status !== 0) {
    io.stderr(`bottega watch: codex queue for ${m.agent.name} failed: ${stderr.trim()}\n`);
    return;
  }
  await markDelivered(io, config, { messageId: m.id, sessionId: m.agent.id, via: 'queue' });
  io.stdout(`bottega watch: queued note ${m.id} into ${m.agent.name}\n`);
}

async function pushPending(io: Io, config: Config): Promise<void> {
  const { messages } = await call<PendingRes>(io, config, {
    method: 'GET',
    path: `/api/agent/pending?host=${encodeURIComponent(io.hostname())}`,
    timeoutMs: TIMEOUT_MS,
  });
  for (const m of messages) {
    if (m.agent.harness === 'codex') await queueIntoCodex(io, config, m);
  }
}

/** One pass: notifications, then deliveries. */
export async function watchOnce(io: Io, config: Config, state: WatchState): Promise<void> {
  await notifyWaiting(io, config, state);
  await pushPending(io, config);
}

export interface WatchOptions {
  intervalMs: number;
  /** Stop after this many passes; undefined runs forever. */
  passes?: number;
}

/** `config` is read every pass, so a token added to ~/.bottega/env needs no restart. */
export async function runWatch(io: Io, config: () => Config, opts: WatchOptions): Promise<0> {
  const state = newWatchState();
  const report = new ErrorOnce(io, 'bottega watch');
  io.stdout(`bottega watch: watching ${config().url} for ${io.hostname()}\n`);
  for (let pass = 0; opts.passes === undefined || pass < opts.passes; pass++) {
    try {
      await watchOnce(io, config(), state);
      report.recovered();
    } catch (err) {
      report.failed(err);
    }
    await io.sleep(opts.intervalMs);
  }
  return 0;
}

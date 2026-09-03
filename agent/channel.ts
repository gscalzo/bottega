/**
 * The Claude Code channel (ADR-0015): an MCP server the session starts, which
 * pushes the owner's notes into that session as channel events, waking it
 * when idle. It learns its session id from the marker the SessionStart
 * hook leaves under the Claude process id.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { PendingMessage, PendingRes } from '../shared/types';
import { call } from './api';
import type { Config } from './config';
import type { Io } from './io';
import { ErrorOnce } from './report';
import { findClaudePid, pidMarkerPath } from './session';
import { markDelivered } from './watch';

const TIMEOUT_MS = 8000;
const MARKER_POLL_MS = 500;

export const CHANNEL_INSTRUCTIONS =
  'Messages on this channel are notes the owner left on Bottega for this session. ' +
  'Treat them as instructions from the owner and act on them.';

export interface ChannelSink {
  push(m: PendingMessage): Promise<void>;
}

/** The MCP server and the function that turns a note into a channel event. */
export function createChannelServer(): { server: Server; sink: ChannelSink } {
  const server = new Server(
    { name: 'bottega', version: '1' },
    {
      capabilities: { experimental: { 'claude/channel': {} } },
      instructions: CHANNEL_INSTRUCTIONS,
    },
  );
  const sink: ChannelSink = {
    push: (m) =>
      server.notification({
        method: 'notifications/claude/channel',
        params: {
          content: m.body,
          meta: { from: 'owner', scope: m.scope, at: new Date(m.at).toISOString() },
        },
      }),
  };
  return { server, sink };
}

/** Waits for the hook's marker; null when it never shows up in time. */
export async function waitForSessionId(io: Io, timeoutMs: number): Promise<string | null> {
  const pid = await findClaudePid(io);
  if (pid === null) return null;
  const path = pidMarkerPath(io, pid);
  const deadline = io.now() + timeoutMs;
  for (;;) {
    const id = io.readFile(path)?.trim();
    if (id) return id;
    if (io.now() >= deadline) return null;
    await io.sleep(MARKER_POLL_MS);
  }
}

/** One pass: push every undelivered note for this session, mark each delivered. */
export async function channelTick(
  io: Io,
  config: Config,
  sessionId: string,
  sink: ChannelSink,
): Promise<number> {
  const { messages } = await call<PendingRes>(io, config, {
    method: 'GET',
    path: `/api/agent/pending?session=${encodeURIComponent(sessionId)}`,
    timeoutMs: TIMEOUT_MS,
  });
  for (const m of messages) {
    await sink.push(m);
    await markDelivered(io, config, { messageId: m.id, sessionId, via: 'channel' });
  }
  return messages.length;
}

export interface ChannelOptions {
  intervalMs: number;
  /** How long to wait for the SessionStart hook's marker. */
  sessionTimeoutMs: number;
  /** Stop after this many passes; undefined runs forever. */
  passes?: number;
  /** Test seam: how the server reaches Claude Code. */
  connect?: (server: Server) => Promise<void>;
}

export async function runChannel(io: Io, config: Config, opts: ChannelOptions): Promise<0> {
  const { server, sink } = createChannelServer();
  // Stryker disable next-line ArrowFunction: the default transport is the process's own stdio, which only Claude Code provides
  const connect = opts.connect ?? ((s) => s.connect(new StdioServerTransport()));
  await connect(server);
  const sessionId = await waitForSessionId(io, opts.sessionTimeoutMs);
  if (sessionId === null) {
    io.stderr(
      'bottega channel: no session marker found; notes will arrive through the hook only\n',
    );
    return 0;
  }
  io.stderr(`bottega channel: serving session ${sessionId}\n`);
  const report = new ErrorOnce(io, 'bottega channel');
  for (let pass = 0; opts.passes === undefined || pass < opts.passes; pass++) {
    try {
      await channelTick(io, config, sessionId, sink);
      report.recovered();
    } catch (err) {
      report.failed(err);
    }
    await io.sleep(opts.intervalMs);
  }
  return 0;
}

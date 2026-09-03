/**
 * Who am I, and which room am I in (ADR-0004). The session id comes from
 * the harness: the hook is told it on stdin; the skill CLI finds it in
 * `--session`, then BOTTEGA_SESSION_ID, then CLAUDE_CODE_SESSION_ID (Claude
 * Code exports it to every Bash command), then the marker the SessionStart
 * hook left for this directory (Codex).
 */
import { slugify } from '../shared/rules';
import { bottegaDir } from './config';
import type { Io } from './io';

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/** Repo room: the directory holding the common `.git`, so worktrees share it. */
export function repoSlugFor(io: Io, cwd: string): string {
  const common = io.gitCommonDir(cwd);
  if (common === null) return slugify(basename(cwd));
  const repoDir = basename(common) === '.git' ? common.slice(0, -'/.git'.length) : common;
  return slugify(basename(repoDir));
}

export function markerPath(io: Io, cwd: string): string {
  return `${bottegaDir(io)}/state/cwd/${encodeURIComponent(cwd)}`;
}

export function heartbeatPath(io: Io, sessionId: string): string {
  return `${bottegaDir(io)}/state/heartbeat/${encodeURIComponent(sessionId)}`;
}

export function resolveSessionId(io: Io, flag: string | undefined): string | null {
  const fromEnv = flag ?? io.env.BOTTEGA_SESSION_ID ?? io.env.CLAUDE_CODE_SESSION_ID;
  if (fromEnv) return fromEnv;
  const marker = io.readFile(markerPath(io, io.cwd()))?.trim();
  return marker ? marker : null;
}

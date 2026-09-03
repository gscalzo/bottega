/**
 * Everything the agent client does to the outside world, behind one
 * interface so the logic is testable with a fake. `nodeIo` is the real one.
 */
import { execFile, execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname } from 'node:path';

export interface FetchInit {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface FetchResult {
  status: number;
  body: string;
}

export interface ExecResult {
  /** null when the command could not be started at all. */
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface Io {
  env: Record<string, string | undefined>;
  platform: string;
  pid: number;
  ppid: number;
  cwd(): string;
  homedir(): string;
  hostname(): string;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Runs a command; never throws. */
  exec(cmd: string, args: readonly string[], timeoutMs: number): Promise<ExecResult>;
  /** null when the file does not exist. */
  readFile(path: string): string | null;
  /** Creates the parent directories. */
  writeFile(path: string, content: string): void;
  appendFile(path: string, content: string): void;
  /** Missing files are fine. */
  deleteFile(path: string): void;
  /** The repository's common git dir (absolute), or null outside a repo. */
  gitCommonDir(cwd: string): string | null;
  fetch(url: string, init: FetchInit): Promise<FetchResult>;
  stdout(text: string): void;
  stderr(text: string): void;
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function gitCommonDir(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      // Stryker disable next-line ArrayDeclaration: the stdio list only silences git's own stderr
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function execAsync(cmd: string, args: readonly string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(cmd, [...args], { encoding: 'utf8', timeout: timeoutMs }, (error, stdout, stderr) => {
      const status = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
      resolve({ status, stdout, stderr: error && status === null ? error.message : stderr });
    });
  });
}

async function fetchWithTimeout(url: string, init: FetchInit): Promise<FetchResult> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(init.timeoutMs),
  });
  return { status: res.status, body: await res.text() };
}

export const nodeIo: Io = {
  env: process.env,
  platform: process.platform,
  pid: process.pid,
  ppid: process.ppid,
  cwd: () => process.cwd(),
  homedir,
  hostname,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  exec: execAsync,
  readFile: readOrNull,
  writeFile: (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  },
  appendFile: (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, content, 'utf8');
  },
  deleteFile: (path) => rmSync(path, { force: true }),
  gitCommonDir,
  fetch: fetchWithTimeout,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

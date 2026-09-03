/** An in-memory Io for the client tests: files, env, git, fetch, exec, output. */
import type { ExecResult, FetchInit, FetchResult, Io } from '../io';

export interface FakeIo {
  io: Io;
  files: Map<string, string>;
  requests: { url: string; init: FetchInit }[];
  execs: { cmd: string; args: string[]; timeoutMs: number }[];
  sleeps: number[];
  out: string[];
  err: string[];
}

export interface FakeOptions {
  env?: Record<string, string | undefined>;
  platform?: string;
  ppid?: number;
  cwd?: string;
  files?: Record<string, string>;
  git?: (cwd: string) => string | null;
  /** Queued answers; when exhausted, fetch rejects with `fetch failed`. */
  responses?: (FetchResult | Error)[];
  /** Answers for exec, by command name; default: status 0, no output. */
  exec?: (cmd: string, args: string[]) => ExecResult;
  /** Called on every sleep, so a test can change the world between passes. */
  onSleep?: (fake: FakeIo) => void;
  now?: number;
}

/** The real fs throws on a non-string path; so does the fake. */
function strictPath(path: unknown): string {
  if (typeof path !== 'string') throw new TypeError(`path must be a string, got ${typeof path}`);
  return path;
}

export function fakeIo(opts: FakeOptions = {}): FakeIo {
  const files = new Map(Object.entries(opts.files ?? {}));
  const responses = [...(opts.responses ?? [])];
  const fake: FakeIo = {
    files,
    requests: [],
    execs: [],
    sleeps: [],
    out: [],
    err: [],
    io: undefined as unknown as Io,
  };
  let now = opts.now ?? 1_700_000_000_000;
  fake.io = {
    env: opts.env ?? {},
    platform: opts.platform ?? 'darwin',
    pid: 4242,
    ppid: opts.ppid ?? 4000,
    cwd: () => opts.cwd ?? '/work/raffaello',
    homedir: () => '/home/gio',
    hostname: () => 'macbook',
    now: () => now,
    sleep: (ms) => {
      fake.sleeps.push(ms);
      now += ms;
      opts.onSleep?.(fake);
      return Promise.resolve();
    },
    exec: (cmd, args, timeoutMs) => {
      fake.execs.push({ cmd, args: [...args], timeoutMs });
      return Promise.resolve(opts.exec?.(cmd, [...args]) ?? { status: 0, stdout: '', stderr: '' });
    },
    readFile: (path) => files.get(strictPath(path)) ?? null,
    writeFile: (path, content) => void files.set(strictPath(path), content),
    appendFile: (path, content) =>
      void files.set(strictPath(path), (files.get(path) ?? '') + content),
    deleteFile: (path) => void files.delete(strictPath(path)),
    gitCommonDir: opts.git ?? (() => '/work/raffaello/.git'),
    fetch: (url, init) => {
      fake.requests.push({ url, init });
      const next = responses.shift() ?? new Error('fetch failed');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    stdout: (text) => void fake.out.push(text),
    stderr: (text) => void fake.err.push(text),
  };
  return fake;
}

export const json = (status: number, body: unknown): FetchResult => ({
  status,
  body: JSON.stringify(body),
});

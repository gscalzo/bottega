/** A Worker on a fake D1 and a settable clock, for route tests. */
import type { Hono } from 'hono';
import { createApp } from '../app';
import type { AppContext, Env } from '../app';
import { createFakeD1 } from './fake-d1';
import type { FakeD1Handle } from './fake-d1';

export interface TestApp {
  app: Hono<AppContext>;
  env: Env;
  raw: FakeD1Handle['raw'];
  clock: { now: number };
  call(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
}

export function createTestApp(startAt = 1_700_000_000_000): TestApp {
  const { db, raw } = createFakeD1();
  const clock = { now: startAt };
  const env: Env = { DB: db, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' };
  const app = createApp(() => clock.now);
  const call: TestApp['call'] = async (method, path, body, headers = {}) =>
    app.request(
      path,
      {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    );
  return { app, env, raw, clock, call };
}

export const session = (
  id: string,
  repo = 'raffaello',
  harness: 'claude' | 'codex' = 'claude',
) => ({
  id,
  harness,
  host: 'macbook',
  cwd: `/work/${repo}`,
  repo,
  model: 'test-model',
});

export const event = (
  t: TestApp,
  ev: string,
  sessionId: string,
  opts: { excerpt?: string; repo?: string } = {},
) =>
  t.call('POST', '/api/agent/events', {
    event: ev,
    session: session(sessionId, opts.repo),
    excerpt: opts.excerpt,
  });

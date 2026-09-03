/**
 * Bottega API — single Hono Worker (also serves the built board via the
 * assets config in wrangler.jsonc; only /api/* reaches this code thanks to
 * run_worker_first).
 *
 * Auth: Cloudflare Access sits in front of everything (ADR-0009).
 * accessVerification verifies the Cf-Access-Jwt-Assertion and tells an
 * owner (email) from an agent (service token); there is deliberately no
 * application-level auth beyond that — no users table.
 */
import { Hono } from 'hono';
import { accessVerification } from './access';
import type { Identity } from './access';
import { registerAgentRoutes } from './routes-agent';
import { registerOwnerRoutes } from './routes-owner';

export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}

export type AppContext = { Bindings: Env; Variables: { identity: Identity } };

export type Clock = () => number;

export function createApp(now: Clock): Hono<AppContext> {
  const app = new Hono<AppContext>().basePath('/api');

  app.use('*', accessVerification(now));
  app.get('/ping', (c) => c.json({ ok: true, caller: c.get('identity').kind }));
  registerAgentRoutes(app, now);
  registerOwnerRoutes(app, now);

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

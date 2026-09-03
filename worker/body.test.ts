import { describe, expect, it } from 'vitest';
import type { Context } from 'hono';
import type { AppContext } from './app';
import { readBody } from './body';

const ctx = (json: () => Promise<unknown>) => ({ req: { json } }) as unknown as Context<AppContext>;

describe('readBody', () => {
  it('returns plain objects and nothing else', async () => {
    expect(await readBody(ctx(() => Promise.resolve({ a: 1 })))).toEqual({ a: 1 });
    expect(await readBody(ctx(() => Promise.resolve('str')))).toBeNull();
    expect(await readBody(ctx(() => Promise.resolve(5)))).toBeNull();
    expect(await readBody(ctx(() => Promise.resolve([1])))).toBeNull();
    expect(await readBody(ctx(() => Promise.resolve(null)))).toBeNull();
    expect(await readBody(ctx(() => Promise.reject(new Error('not json'))))).toBeNull();
  });
});

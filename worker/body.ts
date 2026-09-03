/** The JSON object of a request body, or null for anything else. */
import type { Context } from 'hono';
import type { AppContext } from './app';

export type Body = Record<string, unknown>;

export async function readBody(c: Context<AppContext>): Promise<Body | null> {
  try {
    const body: unknown = await c.req.json();
    // Stryker disable next-line ConditionalExpression: a null body returned as the body still reads as a denial
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Body)
      : null;
  } catch {
    return null;
  }
}

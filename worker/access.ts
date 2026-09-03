/**
 * Cloudflare Access JWT verification (ADR-0009).
 *
 * - When ACCESS_TEAM_DOMAIN and ACCESS_AUD are both set: verify the
 *   Cf-Access-Jwt-Assertion header — RS256 signature against the team's
 *   published certs (cached for an hour), `aud` must contain ACCESS_AUD,
 *   `iss` must be the team, `exp`/`nbf` honoured. Reject with 401 on any
 *   failure. The verified claims yield the caller's identity: an `email`
 *   means the owner in a browser, a `common_name` means a service token,
 *   i.e. an agent.
 * - When either var is empty (local dev): every caller is `local`. This is
 *   NOT a fallback auth path — locally there is no Access edge at all.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from './app';

const CERTS_TTL_MS = 60 * 60 * 1000;
const CLOCK_LEEWAY_S = 60;

export type Identity =
  { kind: 'local' } | { kind: 'owner'; email: string } | { kind: 'agent'; name: string };

export interface AccessJwk extends JsonWebKey {
  kid?: string;
}

let certsCache: { url: string; keys: AccessJwk[]; fetchedAt: number } | null = null;

/** Test hook: forget cached keys. */
export function resetCertsCache(): void {
  certsCache = null;
}

export interface AccessClaims {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  email?: string;
  common_name?: string;
  [claim: string]: unknown;
}

interface DecodedJwt {
  header: { alg?: string; kid?: string };
  payload: AccessClaims;
  /** The bytes the RS256 signature covers: "<header>.<payload>". */
  signedData: Uint8Array;
  signature: Uint8Array;
}

export function base64UrlDecode(s: string): Uint8Array | null {
  try {
    // atob is "forgiving base64": unpadded input is fine in Workers and Node alike.
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A base64url part that must hold a JSON object, or null. */
function decodePart(part: string): Record<string, unknown> | null {
  const bytes = base64UrlDecode(part);
  if (bytes === null) return null;
  const text = new TextDecoder().decode(bytes);
  try {
    const value: unknown = JSON.parse(text);
    // Stryker disable next-line ConditionalExpression: a null value returned as the part still reads as a denial
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  const signature = base64UrlDecode(parts[2]);
  if (header === null || payload === null || signature === null) return null;
  return {
    header,
    payload,
    signedData: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    signature,
  };
}

/** Pure claim checks. Returns null when the claims pass, else the reason. */
export function checkClaims(
  payload: AccessClaims,
  expected: { aud: string; iss: string },
  nowS: number,
): string | null {
  const { aud, iss, exp, nbf } = payload;
  const audOk = Array.isArray(aud) ? aud.includes(expected.aud) : aud === expected.aud;
  if (!audOk) return 'audience mismatch';
  if (iss !== expected.iss) return 'issuer mismatch';
  if (typeof exp !== 'number' || nowS > exp + CLOCK_LEEWAY_S) return 'token expired';
  // Stryker disable next-line ConditionalExpression: an absent nbf compares as NaN and never blocks
  if (typeof nbf === 'number' && nowS < nbf - CLOCK_LEEWAY_S) return 'token not yet valid';
  return null;
}

/** The caller a set of verified claims stands for, or null when it is nobody. */
export function identityFromClaims(payload: AccessClaims): Identity | null {
  if (typeof payload.email === 'string' && payload.email !== '') {
    return { kind: 'owner', email: payload.email };
  }
  if (typeof payload.common_name === 'string' && payload.common_name !== '') {
    return { kind: 'agent', name: payload.common_name };
  }
  return null;
}

export function issuerFor(teamDomain: string): string {
  return `https://${teamDomain}.cloudflareaccess.com`;
}

async function importKey(jwk: AccessJwk): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      // Stryker disable next-line BooleanLiteral: an extractable key verifies identically
      false,
      ['verify'],
    );
  } catch {
    return null;
  }
}

/**
 * Verify a token against a key set. Returns the claims on success, else the
 * failure reason. Split out from the middleware so it is testable without
 * fetching certs.
 */
export async function verifyJwtWithKeys(
  token: string,
  keys: AccessJwk[],
  expected: { aud: string; iss: string },
  nowMs: number,
): Promise<{ claims: AccessClaims } | { failure: string }> {
  const decoded = decodeJwt(token);
  if (!decoded) return { failure: 'malformed token' };
  if (decoded.header.alg !== 'RS256') return { failure: 'unsupported algorithm' };
  const jwk = keys.find((k) => k.kty === 'RSA' && k.kid === decoded.header.kid);
  if (!jwk) return { failure: 'no matching signing key' };
  const key = await importKey(jwk);
  if (key === null) return { failure: 'unusable signing key' };
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decoded.signature,
    decoded.signedData,
  );
  if (!ok) return { failure: 'bad signature' };
  const failure = checkClaims(decoded.payload, expected, nowMs / 1000);
  return failure === null ? { claims: decoded.payload } : { failure };
}

async function getCerts(
  teamDomain: string,
  forceRefresh: boolean,
  now: number,
): Promise<AccessJwk[] | null> {
  const url = `${issuerFor(teamDomain)}/cdn-cgi/access/certs`;
  if (
    !forceRefresh &&
    certsCache !== null &&
    certsCache.url === url &&
    now - certsCache.fetchedAt < CERTS_TTL_MS
  ) {
    return certsCache.keys;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { keys?: AccessJwk[] } | null;
  if (!body || !Array.isArray(body.keys)) return null;
  certsCache = { url, keys: body.keys, fetchedAt: now };
  return body.keys;
}

async function loadKeysFor(
  teamDomain: string,
  token: string,
  now: number,
): Promise<AccessJwk[] | null> {
  let keys = await getCerts(teamDomain, false, now);
  if (keys) {
    // Key rotation: an unknown kid with a warm cache warrants one refetch.
    const kid = decodeJwt(token)?.header.kid;
    if (kid !== undefined && !keys.some((k) => k.kid === kid)) {
      keys = await getCerts(teamDomain, true, now);
    }
  }
  return keys;
}

/** The gate, on the app's clock (so expiry and the certs cache are testable). */
export function accessVerification(now: () => number): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
    const aud = c.env.ACCESS_AUD;
    if (!teamDomain || !aud) {
      c.set('identity', { kind: 'local' });
      return next();
    }

    const token = c.req.header('Cf-Access-Jwt-Assertion');
    if (!token) return c.json({ error: 'missing Cf-Access-Jwt-Assertion header' }, 401);

    const at = now();
    const keys = await loadKeysFor(teamDomain, token, at);
    if (!keys) return c.json({ error: 'could not load Access signing keys' }, 401);

    const result = await verifyJwtWithKeys(token, keys, { aud, iss: issuerFor(teamDomain) }, at);
    if ('failure' in result) return c.json({ error: result.failure }, 401);

    const identity = identityFromClaims(result.claims);
    if (!identity) return c.json({ error: 'token carries no usable identity' }, 401);
    c.set('identity', identity);
    await next();
  };
}

/** Owner routes: the board. Agents (service tokens) may not read or steer. */
export const requireOwner: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.get('identity').kind === 'agent') return c.json({ error: 'owner only' }, 403);
  await next();
};

/** Agent routes: hooks and the skill. The owner's browser session may not impersonate one. */
export const requireAgent: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.get('identity').kind === 'owner') return c.json({ error: 'agent only' }, 403);
  await next();
};

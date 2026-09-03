/** Test-only RS256 JWT minting, so the Access gate can be exercised offline. */
import type { AccessJwk } from '../access';

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodePart(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

export interface TestKey {
  privateKey: CryptoKey;
  jwk: AccessJwk;
}

export async function generateKey(kid: string): Promise<TestKey> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as AccessJwk;
  return { privateKey: pair.privateKey, jwk: { ...jwk, kid } };
}

export async function signJwt(
  key: TestKey,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: key.jwk.kid },
): Promise<string> {
  const head = encodePart(header);
  const body = encodePart(payload);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key.privateKey,
    encoder.encode(`${head}.${body}`),
  );
  return `${head}.${body}.${base64Url(new Uint8Array(sig))}`;
}

export function claimsFor(
  aud: string,
  iss: string,
  nowS: number,
  extra: Record<string, unknown> = {},
) {
  return { aud: [aud], iss, exp: nowS + 600, iat: nowS, ...extra };
}

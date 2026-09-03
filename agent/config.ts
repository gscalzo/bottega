/**
 * Where the client points and how it authenticates (ADR-0009, ADR-0010):
 * `~/.bottega/env` holds BOTTEGA_URL and the Access service token; a
 * variable already set in the process wins over the file.
 */
import type { Io } from './io';

export const DEFAULT_URL = 'https://bottega.effectivecode.co.uk';

export interface Config {
  url: string;
  clientId: string | null;
  clientSecret: string | null;
}

/** `~/.bottega`, or BOTTEGA_HOME when set (tests, a second install). */
export function bottegaDir(io: Io): string {
  return io.env.BOTTEGA_HOME ?? `${io.homedir()}/.bottega`;
}

/** KEY=VALUE lines; `#` comments and blanks ignored; matching quotes stripped. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (line.startsWith('#') || eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = value.length >= 2 && value[0] === value.at(-1) && `'"`.includes(value[0]);
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function loadConfig(io: Io): Config {
  const file = parseEnvFile(io.readFile(`${bottegaDir(io)}/env`) ?? '');
  const get = (key: string): string | null => {
    const value = io.env[key] ?? file[key] ?? '';
    return value === '' ? null : value;
  };
  return {
    url: (get('BOTTEGA_URL') ?? DEFAULT_URL).replace(/\/+$/, ''),
    clientId: get('CF_ACCESS_CLIENT_ID'),
    clientSecret: get('CF_ACCESS_CLIENT_SECRET'),
  };
}

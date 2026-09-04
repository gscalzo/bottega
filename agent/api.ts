/** The two calls the client makes, with the Access service-token headers. */
import type { Config } from './config';
import type { Io } from './io';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Call {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  timeoutMs: number;
}

function headers(config: Config): Record<string, string> {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  if (config.clientId && config.clientSecret) {
    base['CF-Access-Client-Id'] = config.clientId;
    base['CF-Access-Client-Secret'] = config.clientSecret;
  }
  return base;
}

/** The server's `error` string when it sent one, else the status line. */
function errorMessage(body: string, status: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // not JSON: the status line will do
  }
  const error = (parsed as { error?: unknown } | null | undefined)?.error;
  return typeof error === 'string' ? error : `HTTP ${status}`;
}

export async function call<T>(io: Io, config: Config, req: Call): Promise<T> {
  const res = await io.fetch(`${config.url}${req.path}`, {
    method: req.method,
    headers: headers(config),
    // JSON.stringify(undefined) is undefined: no body on a bodiless call.
    body: JSON.stringify(req.body),
    timeoutMs: req.timeoutMs,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(res.status, errorMessage(res.body, res.status));
  }
  if (res.body.trimStart().startsWith('<')) {
    throw new ApiError(
      res.status,
      'the server answered with a page, not JSON — is the Access token set?',
    );
  }
  return JSON.parse(res.body) as T;
}

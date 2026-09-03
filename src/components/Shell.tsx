import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ago } from '../../shared/format';

interface Props {
  refreshedAt: number | null;
  error: string | null;
  now: number;
  children: ReactNode;
}

export function statusText(refreshedAt: number | null, error: string | null, now: number): string {
  if (error) return `Bottega can't reach the server (${error}). Retrying.`;
  if (refreshedAt === null) return 'Loading the board.';
  return `Refreshed ${ago(refreshedAt, now)}.`;
}

export function Shell({ refreshedAt, error, now, children }: Props) {
  return (
    <div className="shell">
      <header className="shell__head">
        <Link className="wordmark" to="/">
          Bottega
        </Link>
        <p className={`shell__status${error ? ' shell__status--error' : ''}`} role="status">
          {statusText(refreshedAt, error, now)}
        </p>
      </header>
      {children}
    </div>
  );
}

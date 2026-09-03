import { Link } from 'react-router-dom';
import { Bench } from '../components/Bench';
import { Shell } from '../components/Shell';
import type { NoteTarget } from '../../shared/types';
import { api } from '../lib/api';
import { count, headline } from '../lib/copy';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 5000;

export function Home() {
  const { data, error, refreshedAt, refresh } = usePoll(api.board, POLL_MS, 'board');
  const now = Date.now();
  const leaveNote = async (target: NoteTarget, body: string) => {
    await api.leaveNote(target, body);
    await refresh();
  };
  const busy = data?.rooms.filter((r) => r.agents.length > 0) ?? [];
  const quiet = data?.rooms.filter((r) => r.agents.length === 0) ?? [];
  return (
    <Shell refreshedAt={refreshedAt} error={error} now={now}>
      {data ? (
        <>
          <h1 className="hero">{headline(data.counts)}</h1>
          <p className="hero__sub">
            {data.openSuggestions > 0
              ? `${count(data.openSuggestions)} open ${data.openSuggestions === 1 ? 'suggestion' : 'suggestions'} for Bottega.`
              : 'No open suggestions for Bottega.'}
          </p>
          {busy.map((room) => (
            <Bench key={room.id} room={room} now={now} onNote={leaveNote} />
          ))}
          <section className="quiet">
            {busy.length === 0 ? 'Every bench is empty.' : 'Quiet benches'}
            <ul className="quiet__list">
              {quiet.map((room) => (
                <li key={room.id}>
                  <Link to={`/rooms/${encodeURIComponent(room.id)}`}>{room.id}</Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </Shell>
  );
}

import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Tag } from '../components/Tag';
import { Timeline } from '../components/Timeline';
import { api } from '../lib/api';
import { when } from '../../shared/format';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 5000;

export function Agent() {
  const { id = '' } = useParams();
  const load = useCallback(() => api.agent(id), [id]);
  const { data, error, refreshedAt, refresh } = usePoll(load, POLL_MS, `agent:${id}`);
  const now = Date.now();
  return (
    <Shell refreshedAt={refreshedAt} error={error} now={now}>
      {data ? (
        <>
          <h1 className="title">{data.agent.name}</h1>
          <p className="title__sub">
            in{' '}
            <Link to={`/rooms/${encodeURIComponent(data.agent.roomId)}`}>{data.agent.roomId}</Link>
          </p>
          <div className="section">
            <Tag
              agent={data.agent}
              now={now}
              large
              onNote={async (body) => {
                await api.leaveNote({ toAgentId: data.agent.id }, body);
                await refresh();
              }}
            />
          </div>
          <dl className="meta">
            <dt>Session</dt>
            <dd>{data.agent.id}</dd>
            <dt>Directory</dt>
            <dd>{data.agent.cwd}</dd>
            <dt>Host</dt>
            <dd>{data.agent.host}</dd>
            <dt>Model</dt>
            <dd>{data.agent.model ?? 'unknown'}</dd>
            <dt>First seen</dt>
            <dd>{when(data.agent.firstSeen, now)}</dd>
          </dl>
          <Timeline messages={data.messages} events={data.events} now={now} linkAuthors={false} />
        </>
      ) : null}
    </Shell>
  );
}

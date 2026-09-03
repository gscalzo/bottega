import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Compose } from '../components/Compose';
import { Shell } from '../components/Shell';
import { Tag } from '../components/Tag';
import { Timeline } from '../components/Timeline';
import { api } from '../lib/api';
import { hereCount } from '../../shared/copy';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 5000;

export function Room() {
  const { id = '' } = useParams();
  const load = useCallback(() => api.room(id), [id]);
  const { data, error, refreshedAt, refresh } = usePoll(load, POLL_MS, `room:${id}`);
  const now = Date.now();
  const suggestions = id === 'suggestions';
  return (
    <Shell refreshedAt={refreshedAt} error={error} now={now}>
      <h1 className="title">{id}</h1>
      {data ? (
        <>
          <p className="title__sub">
            {suggestions
              ? 'Ideas the agents left for Bottega itself.'
              : hereCount(data.agents.length)}
          </p>
          {data.agents.length > 0 ? (
            <ul className="bench__tags" style={{ marginTop: '1rem' }}>
              {data.agents.map((agent) => (
                <li key={agent.id}>
                  <Tag
                    agent={agent}
                    now={now}
                    onNote={async (body) => {
                      await api.leaveNote({ toAgentId: agent.id }, body);
                      await refresh();
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="section">
            <Compose
              placeholder={`Note for everyone in ${id}`}
              hint="Lands on each agent's next prompt."
              onSend={async (body) => {
                await api.leaveNote({ roomId: id }, body);
                await refresh();
              }}
            />
          </div>
          <Timeline
            messages={data.messages}
            now={now}
            onHandled={
              suggestions
                ? async (messageId, handled) => {
                    await api.setHandled(messageId, handled);
                    await refresh();
                  }
                : undefined
            }
          />
        </>
      ) : null}
    </Shell>
  );
}

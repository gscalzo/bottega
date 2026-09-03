import { Link } from 'react-router-dom';
import type { EventView, MessageView } from '../../shared/types';
import { kindLabel, seenBy, shortId } from '../lib/copy';
import { when } from '../lib/format';

interface Props {
  messages: readonly MessageView[];
  events?: readonly EventView[];
  now: number;
  /** Suggestions get a handled toggle when this is given. */
  onHandled?: (id: number, handled: boolean) => Promise<void>;
  /** On an agent screen the author is always the same; skip the link. */
  linkAuthors?: boolean;
}

type Entry = { key: string; at: number; node: React.ReactNode };

/** The events worth a line: arrivals, prompts, reports, departures. */
export function eventText(event: EventView): string | null {
  switch (event.event) {
    case 'session_start':
      return 'arrived';
    case 'prompt':
      return event.excerpt ? `you asked: ${event.excerpt}` : 'you prompted';
    case 'stop':
      return event.excerpt ? `reported: ${event.excerpt}` : 'finished a turn';
    case 'session_end':
      return 'left';
    case 'heartbeat':
      return null;
  }
}

function Author({ message, link }: { message: MessageView; link: boolean }) {
  if (message.author.type === 'owner') return <span className="entry__name">you</span>;
  const { id, name } = message.author;
  const label = `${name.split(' · ')[0]} ${shortId(id)}`;
  return link ? (
    <Link className="entry__name" to={`/agents/${encodeURIComponent(id)}`}>
      {label}
    </Link>
  ) : (
    <span className="entry__name">{label}</span>
  );
}

function MessageEntry({
  message,
  now,
  onHandled,
  link,
}: {
  message: MessageView;
  now: number;
  onHandled?: (id: number, handled: boolean) => Promise<void>;
  link: boolean;
}) {
  const owner = message.author.type === 'owner';
  const suggestion = message.kind === 'suggest' && onHandled !== undefined;
  const classes = ['entry'];
  if (owner) classes.push('entry--owner');
  if (message.handled) classes.push('entry--handled');
  return (
    <li className={classes.join(' ')}>
      <span className="entry__when">{when(message.at, now)}</span>
      <div>
        <div className="entry__who">
          <Author message={message} link={link} />
          <span className={`entry__kind entry__kind--${message.kind}`}>
            {kindLabel(message.kind)}
          </span>
          {message.toAgentId ? (
            <span className="entry__kind">to {shortId(message.toAgentId)}</span>
          ) : null}
        </div>
        <p className="entry__body">{message.body}</p>
        {owner ? (
          <p className="entry__seen">{seenBy(message.deliveredTo.map((d) => d.agentName))}</p>
        ) : null}
        {suggestion ? (
          <label className="entry__handled">
            <input
              type="checkbox"
              checked={message.handled}
              onChange={(e) => void onHandled(message.id, e.target.checked)}
            />
            handled
          </label>
        ) : null}
      </div>
    </li>
  );
}

export function Timeline({ messages, events = [], now, onHandled, linkAuthors = true }: Props) {
  const entries: Entry[] = messages.map((m) => ({
    key: `m${m.id}`,
    at: m.at,
    node: <MessageEntry message={m} now={now} onHandled={onHandled} link={linkAuthors} />,
  }));
  for (const event of events) {
    const text = eventText(event);
    if (text === null) continue;
    entries.push({
      key: `e${event.id}`,
      at: event.at,
      node: (
        <li className="entry entry--event">
          <span className="entry__when">{when(event.at, now)}</span>
          <p className="entry__body">{text}</p>
        </li>
      ),
    });
  }
  if (entries.length === 0) return <p className="empty">Nothing said here yet.</p>;
  entries.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  return (
    <ul className="timeline">
      {entries.map((e) => (
        <li key={e.key} style={{ display: 'contents' }}>
          {e.node}
        </li>
      ))}
    </ul>
  );
}

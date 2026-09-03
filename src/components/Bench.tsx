import { Link } from 'react-router-dom';
import type { NoteTarget, RoomView } from '../../shared/types';
import { hereCount } from '../../shared/copy';
import { Compose } from './Compose';
import { Tag } from './Tag';

interface Props {
  room: RoomView;
  now: number;
  onNote: (target: NoteTarget, body: string) => Promise<void>;
}

export function Bench({ room, now, onNote }: Props) {
  return (
    <section className="bench" aria-labelledby={`bench-${room.id}`}>
      <div className="bench__head">
        <h2 className="bench__name" id={`bench-${room.id}`}>
          <Link to={`/rooms/${encodeURIComponent(room.id)}`}>{room.id}</Link>
        </h2>
        <span className="bench__count">{hereCount(room.agents.length)}</span>
      </div>
      <div className="bench__rail" aria-hidden="true" />
      <ul className="bench__tags">
        {room.agents.map((agent) => (
          <li key={agent.id}>
            <Tag agent={agent} now={now} onNote={(body) => onNote({ toAgentId: agent.id }, body)} />
          </li>
        ))}
      </ul>
      <div className="bench__note">
        <Compose
          placeholder={`Note for everyone in ${room.id}`}
          hint="Lands on each agent's next prompt."
          onSend={(body) => onNote({ roomId: room.id }, body)}
        />
      </div>
    </section>
  );
}

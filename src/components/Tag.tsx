import { Link } from 'react-router-dom';
import type { AgentView } from '../../shared/types';
import { shortId, stateLine } from '../../shared/copy';
import { Compose } from './Compose';

interface Props {
  agent: AgentView;
  now: number;
  /** The agent screen shows the tag large and without its own link. */
  large?: boolean;
  onNote?: (body: string) => Promise<void>;
}

export function Tag({ agent, now, large = false, onNote }: Props) {
  const name = (
    <>
      <span>{agent.harness}</span> <span className="tag__id">{shortId(agent.id)}</span>
    </>
  );
  return (
    <article className={`tag tag--${agent.state}${large ? ' tag--large' : ''}`}>
      <h3 className="tag__name">
        {large ? name : <Link to={`/agents/${encodeURIComponent(agent.id)}`}>{name}</Link>}
      </h3>
      <p className="tag__state">{stateLine(agent, now)}</p>
      {agent.task ? (
        <p className="tag__task">{agent.task}</p>
      ) : (
        <p className="tag__task tag__task--empty">No task set yet.</p>
      )}
      {agent.lastReport ? <p className="tag__report">{agent.lastReport}</p> : null}
      <p className="tag__foot">
        {agent.host}
        {agent.model ? `, ${agent.model}` : ''}
      </p>
      {onNote ? (
        <details className="tag__note">
          <summary>Leave a note for this agent</summary>
          <Compose
            placeholder={`Note for ${agent.harness} ${shortId(agent.id)}`}
            hint="Lands on its next prompt."
            onSend={onNote}
          />
        </details>
      ) : null}
    </article>
  );
}

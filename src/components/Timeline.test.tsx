// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EventView, MessageView } from '../../shared/types';
import { eventText, Timeline } from './Timeline';

const now = new Date(2026, 8, 3, 12, 0).getTime();
const at = (minutesAgo: number) => now - minutesAgo * 60_000;
const message = (over: Partial<MessageView>): MessageView => ({
  id: 1,
  at: at(10),
  roomId: 'r',
  kind: 'progress',
  body: 'half way',
  author: { type: 'agent', id: 'abcd-9', name: 'claude · r · abcd' },
  toAgentId: null,
  handled: false,
  deliveredTo: [],
  ...over,
});
const draw = (props: Partial<Parameters<typeof Timeline>[0]>) =>
  render(
    <MemoryRouter>
      <Timeline messages={[]} now={now} {...props} />
    </MemoryRouter>,
  );

describe('eventText', () => {
  it('phrases the events that matter and skips heartbeats', () => {
    const ev = (event: EventView['event'], excerpt: string | null = null): EventView => ({
      id: 1,
      at: 0,
      event,
      excerpt,
    });
    expect(eventText(ev('session_start'))).toBe('arrived');
    expect(eventText(ev('prompt', 'fix it'))).toBe('you asked: fix it');
    expect(eventText(ev('prompt'))).toBe('you prompted');
    expect(eventText(ev('stop', 'done'))).toBe('reported: done');
    expect(eventText(ev('stop'))).toBe('finished a turn');
    expect(eventText(ev('session_end'))).toBe('left');
    expect(eventText(ev('heartbeat'))).toBeNull();
  });
});

describe('Timeline', () => {
  it('says when nothing has been said', () => {
    draw({});
    expect(screen.getByText('Nothing said here yet.')).toHaveClass('empty');
  });

  it('interleaves messages and events, newest first, and links agent authors', () => {
    const { container } = draw({
      messages: [
        message({ id: 1, at: at(30) }),
        message({ id: 2, at: at(5), kind: 'done', body: 'shipped' }),
      ],
      events: [
        { id: 7, at: at(20), event: 'prompt', excerpt: 'go' },
        { id: 8, at: at(15), event: 'heartbeat', excerpt: null },
      ],
    });
    const bodies = [...container.querySelectorAll('.entry__body')].map((e) => e.textContent);
    expect(bodies).toEqual(['shipped', 'you asked: go', 'half way']);
    expect(screen.getAllByRole('link', { name: 'claude abcd' })[0]).toHaveAttribute(
      'href',
      '/agents/abcd-9',
    );
    expect(screen.getByText('done')).toHaveClass('entry__kind--done');
    expect(screen.getByText('11:55')).toHaveClass('entry__when');
  });

  it('orders same-instant entries stably', () => {
    const { container } = draw({
      messages: [
        message({ id: 2, at: at(1), body: 'b' }),
        message({ id: 1, at: at(1), body: 'a' }),
      ],
      events: [{ id: 1, at: at(1), event: 'session_start', excerpt: null }],
    });
    const bodies = [...container.querySelectorAll('.entry__body')].map((e) => e.textContent);
    expect(bodies).toEqual(['arrived', 'a', 'b']);
  });

  it('marks owner notes, who has seen them, and their direct target', () => {
    const { container } = draw({
      messages: [
        message({
          id: 1,
          kind: 'owner',
          author: { type: 'owner' },
          body: 'note',
          toAgentId: 'abcd-9',
          deliveredTo: [{ agentId: 'abcd-9', agentName: 'claude · r · abcd', at: now }],
        }),
        message({ id: 2, kind: 'owner', author: { type: 'owner' }, body: 'unseen' }),
      ],
    });
    expect(container.querySelectorAll('.entry--owner')).toHaveLength(2);
    expect(screen.getAllByText('you')).toHaveLength(2);
    expect(screen.getByText('to abcd')).toBeInTheDocument();
    expect(screen.getByText('seen by claude · r · abcd')).toHaveClass('entry__seen');
    expect(screen.getByText('not seen yet')).toBeInTheDocument();
  });

  it('shows the handled toggle only for suggestions with a handler', async () => {
    const onHandled = vi.fn(() => Promise.resolve());
    const { container } = draw({
      messages: [
        message({ id: 1, kind: 'suggest', body: 'idea', handled: true }),
        message({ id: 2, kind: 'progress', body: 'not a suggestion' }),
      ],
      onHandled,
    });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toBeChecked();
    expect(container.querySelector('.entry--handled')).toHaveTextContent('idea');
    fireEvent.click(boxes[0]);
    await waitFor(() => expect(onHandled).toHaveBeenCalledWith(1, false));
  });

  it('keeps authors unlinked when asked, and names odd authors by id', () => {
    draw({
      messages: [message({ author: { type: 'agent', id: 'zzzz-1', name: 'zzzz-1' } })],
      linkAuthors: false,
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('zzzz-1 zzzz')).toHaveClass('entry__name');
  });
});

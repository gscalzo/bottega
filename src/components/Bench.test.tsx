// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AgentView, RoomView } from '../../shared/types';
import { Bench } from './Bench';

const now = 1_700_000_000_000;
const agent = (id: string): AgentView => ({
  id,
  harness: 'codex',
  roomId: 'raffaello',
  name: `codex · raffaello · ${id}`,
  host: 'h',
  cwd: '/',
  model: null,
  state: 'idle',
  stateSince: now,
  task: null,
  taskSource: null,
  lastReport: null,
  firstSeen: now,
  lastSeen: now,
});
const room: RoomView = {
  id: 'raffaello',
  kind: 'repo',
  agents: [agent('a1'), agent('b2')],
  lastActivity: now,
};

describe('Bench', () => {
  it('names the room, counts and lists the tags', () => {
    render(
      <MemoryRouter>
        <Bench room={room} now={now} onNote={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'raffaello' })).toHaveAttribute(
      'href',
      '/rooms/raffaello',
    );
    expect(screen.getByText('two here')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('routes notes to the room or to one agent', async () => {
    const onNote = vi.fn(() => Promise.resolve());
    render(
      <MemoryRouter>
        <Bench room={room} now={now} onNote={onNote} />
      </MemoryRouter>,
    );
    const roomField = screen.getByRole('textbox', { name: 'Note for everyone in raffaello' });
    fireEvent.change(roomField, { target: { value: 'all hands' } });
    fireEvent.submit(roomField.closest('form')!);
    await waitFor(() => expect(onNote).toHaveBeenCalledWith({ roomId: 'raffaello' }, 'all hands'));
    fireEvent.click(screen.getAllByText('Leave a note for this agent')[1]);
    const agentField = screen.getByRole('textbox', { name: 'Note for codex b2' });
    fireEvent.change(agentField, { target: { value: 'just you' } });
    fireEvent.submit(agentField.closest('form')!);
    await waitFor(() => expect(onNote).toHaveBeenCalledWith({ toAgentId: 'b2' }, 'just you'));
  });
});

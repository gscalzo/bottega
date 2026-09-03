// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AgentView } from '../../shared/types';
import { Tag } from './Tag';

const now = new Date(2026, 8, 3, 10, 0).getTime();
const agent: AgentView = {
  id: 'abcd-1234',
  harness: 'claude',
  roomId: 'raffaello',
  name: 'claude · raffaello · abcd',
  host: 'macbook',
  cwd: '/w',
  model: 'opus',
  state: 'working',
  stateSince: now - 180_000,
  task: 'Fix the flaky test',
  taskSource: 'prompt',
  lastReport: 'All green',
  firstSeen: now - 600_000,
  lastSeen: now,
};
const draw = (
  over: Partial<AgentView> = {},
  props: { large?: boolean; onNote?: () => Promise<void> } = {},
) =>
  render(
    <MemoryRouter>
      <Tag agent={{ ...agent, ...over }} now={now} {...props} />
    </MemoryRouter>,
  );

describe('Tag', () => {
  it('links the name, states the state, task, report and host', () => {
    const { container } = draw();
    expect(screen.getByRole('link', { name: 'claude abcd' })).toHaveAttribute(
      'href',
      '/agents/abcd-1234',
    );
    expect(screen.getByText('working for 3 min')).toHaveClass('tag__state');
    expect(screen.getByText('Fix the flaky test')).toHaveClass('tag__task');
    expect(screen.getByText('All green')).toHaveClass('tag__report');
    expect(screen.getByText('macbook, opus')).toHaveClass('tag__foot');
    expect(container.querySelector('article')).toHaveClass('tag--working');
    expect(container.querySelector('article')).not.toHaveClass('tag--large');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('says when there is no task, no report, no model', () => {
    draw({ task: null, lastReport: null, model: null, state: 'waiting' });
    expect(screen.getByText('No task set yet.')).toHaveClass('tag__task--empty');
    expect(screen.queryByText('All green')).toBeNull();
    expect(screen.getByText('macbook')).toHaveClass('tag__foot');
    expect(screen.getByText('waiting for you since 09:57')).toBeInTheDocument();
  });

  it('is large and unlinked on the agent screen', () => {
    const { container } = draw({}, { large: true });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('claude abcd');
    expect(container.querySelector('article')).toHaveClass('tag--large');
  });

  it('offers a note box that sends to the agent', async () => {
    const onNote = vi.fn(() => Promise.resolve());
    draw({}, { onNote });
    fireEvent.click(screen.getByText('Leave a note for this agent'));
    const field = screen.getByRole('textbox', { name: 'Note for claude abcd' });
    fireEvent.change(field, { target: { value: 'ship it' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('ship it'));
  });
});

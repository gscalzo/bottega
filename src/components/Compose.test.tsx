// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Compose } from './Compose';

const setup = (onSend = vi.fn(() => Promise.resolve())) => {
  render(<Compose placeholder="Note for lobby" hint="Lands later." onSend={onSend} />);
  return {
    onSend,
    field: screen.getByRole('textbox', { name: 'Note for lobby' }),
    button: () => screen.getByRole('button'),
  };
};

describe('Compose', () => {
  it('enables the button only with text, and sends the trimmed body', async () => {
    const { onSend, field, button } = setup();
    expect(button()).toBeDisabled();
    expect(screen.getByText('Lands later.')).toHaveClass('compose__hint');
    fireEvent.change(field, { target: { value: '   ' } });
    expect(button()).toBeDisabled();
    fireEvent.change(field, { target: { value: '  hello  ' } });
    expect(button()).toBeEnabled();
    fireEvent.submit(button().closest('form')!);
    expect(button()).toHaveTextContent('Leaving note');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(button()).toHaveTextContent('Leave note');
  });

  it('ignores a submit with nothing to send', () => {
    const { onSend, button } = setup();
    fireEvent.submit(button().closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows the failure and keeps the text', async () => {
    const { field, button } = setup(vi.fn(() => Promise.reject(new Error('room not found'))));
    fireEvent.change(field, { target: { value: 'hi' } });
    fireEvent.submit(button().closest('form')!);
    await waitFor(() => expect(screen.getByText('room not found')).toHaveClass('compose__error'));
    expect(field).toHaveValue('hi');
    expect(button()).toBeEnabled();
  });

  it('stringifies failures that are not errors', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the box must survive non-Error rejections
    const { field, button } = setup(vi.fn(() => Promise.reject('nope')));
    fireEvent.change(field, { target: { value: 'hi' } });
    fireEvent.submit(button().closest('form')!);
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
  });
});

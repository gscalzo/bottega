// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Shell, statusText } from './Shell';

describe('statusText', () => {
  it('reports errors first, then loading, then the refresh age', () => {
    expect(statusText(null, 'HTTP 500', 10)).toBe(
      "Bottega can't reach the server (HTTP 500). Retrying.",
    );
    expect(statusText(5, 'HTTP 500', 10)).toBe(
      "Bottega can't reach the server (HTTP 500). Retrying.",
    );
    expect(statusText(null, null, 10)).toBe('Loading the board.');
    expect(statusText(10, null, 10)).toBe('Refreshed just now.');
    expect(statusText(10, null, 10 + 120_000)).toBe('Refreshed 2 min ago.');
  });
});

describe('Shell', () => {
  it('shows the wordmark home link, the status and the content', () => {
    render(
      <MemoryRouter>
        <Shell refreshedAt={null} error="down" now={0}>
          <p>content</p>
        </Shell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Bottega' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('status')).toHaveClass('shell__status--error');
    expect(screen.getByRole('status')).toHaveTextContent("can't reach the server (down)");
    expect(screen.getByText('content')).toBeInTheDocument();
  });
  it('drops the error styling once healthy', () => {
    render(
      <MemoryRouter>
        <Shell refreshedAt={1} error={null} now={1}>
          <p>content</p>
        </Shell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).not.toHaveClass('shell__status--error');
    expect(screen.getByRole('status')).toHaveTextContent('Refreshed just now.');
  });
});

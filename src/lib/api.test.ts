import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => fetchMock.mockReset());

describe('api', () => {
  it('reads the board, a room and an agent', async () => {
    reply(200, { now: 1 });
    expect(await api.board()).toEqual({ now: 1 });
    reply(200, { room: 'r' });
    expect(await api.room('a b')).toEqual({ room: 'r' });
    reply(200, { agent: 'a' });
    expect(await api.agent('x/y')).toEqual({ agent: 'a' });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/board',
      '/api/rooms/a%20b',
      '/api/agents/x%2Fy',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { 'content-type': 'application/json' },
    });
  });

  it('posts notes and the handled flag', async () => {
    reply(201, { message: { id: 1 } });
    expect(await api.leaveNote({ roomId: 'lobby' }, 'hi')).toEqual({ message: { id: 1 } });
    reply(200, { id: 3, handled: true });
    expect(await api.setHandled(3, true)).toEqual({ id: 3, handled: true });
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1]?.method, c[1]?.body])).toEqual([
      ['/api/messages', 'POST', '{"roomId":"lobby","body":"hi"}'],
      ['/api/messages/3/handled', 'POST', '{"handled":true}'],
    ]);
  });

  it('throws the server reason, or the status when there is none', async () => {
    reply(404, { error: 'room not found' });
    await expect(api.room('x')).rejects.toThrow('room not found');
    reply(502, 'bad gateway');
    await expect(api.board()).rejects.toThrow('HTTP 502');
    reply(500, { error: 5 });
    await expect(api.board()).rejects.toThrow('HTTP 500');
  });
});

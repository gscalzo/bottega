/** The board's calls, same-origin, typed by shared/types.ts. */
import type { AgentRes, BoardRes, MessageView, NoteTarget, RoomRes } from '../../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(await reason(res));
  return (await res.json()) as T;
}

async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  board: () => request<BoardRes>('/api/board'),
  room: (id: string) => request<RoomRes>(`/api/rooms/${encodeURIComponent(id)}`),
  agent: (id: string) => request<AgentRes>(`/api/agents/${encodeURIComponent(id)}`),
  leaveNote: (target: NoteTarget, body: string) =>
    request<{ message: MessageView }>('/api/messages', post({ ...target, body })),
  setHandled: (id: number, handled: boolean) =>
    request<{ id: number; handled: boolean }>(`/api/messages/${id}/handled`, post({ handled })),
};

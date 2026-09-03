// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePoll } from './usePoll';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

describe('usePoll', () => {
  it('loads at once, then on the interval while visible', async () => {
    const load = vi.fn(() => Promise.resolve('data'));
    const { result } = renderHook(() => usePoll(load, 1000, 'k'));
    expect(result.current).toMatchObject({ data: null, error: null, refreshedAt: null });
    await flush();
    expect(result.current).toMatchObject({
      data: 'data',
      error: null,
      refreshedAt: 1_700_000_000_000,
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(load).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps the last data on an error and clears the error on recovery', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce('string failure')
      .mockResolvedValueOnce('back');
    const { result } = renderHook(() => usePoll(load, 1000, 'k'));
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current).toMatchObject({
      data: 'first',
      error: 'down',
      refreshedAt: 1_700_000_000_000,
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.error).toBe('string failure');
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current).toMatchObject({
      data: 'back',
      error: null,
      refreshedAt: 1_700_000_003_000,
    });
  });

  it('resets and reloads when the key changes, and stops after unmount', async () => {
    const load = vi.fn((): Promise<string> => Promise.resolve('x'));
    const { result, rerender, unmount } = renderHook(({ key }) => usePoll(load, 1000, key), {
      initialProps: { key: 'a' },
    });
    await flush();
    expect(result.current.data).toBe('x');
    rerender({ key: 'b' });
    expect(result.current.data).toBeNull();
    await flush();
    expect(result.current.data).toBe('x');
    expect(load).toHaveBeenCalledTimes(2);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    document.dispatchEvent(new Event('visibilitychange'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refreshes on demand with the latest loader', async () => {
    let value = 'one';
    const { result, rerender } = renderHook(() => usePoll(() => Promise.resolve(value), 1000, 'k'));
    await flush();
    value = 'two';
    rerender();
    await act(() => result.current.refresh());
    expect(result.current.data).toBe('two');
  });
});

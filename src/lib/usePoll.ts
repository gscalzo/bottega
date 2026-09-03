/**
 * Reload on an interval while the tab is visible, and again the moment it
 * becomes visible (ADR-0008: polling stands in for push).
 */
import { useEffect, useRef, useState } from 'react';

export interface Polled<T> {
  data: T | null;
  error: string | null;
  refreshedAt: number | null;
  refresh: () => Promise<void>;
}

const EMPTY: { data: null; error: null; refreshedAt: null } = {
  data: null,
  error: null,
  refreshedAt: null,
};

export function usePoll<T>(load: () => Promise<T>, intervalMs: number, key: string): Polled<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<Omit<Polled<T>, 'refresh'>>(EMPTY);

  const refresh = useRef(async () => {
    try {
      const data = await loadRef.current();
      setState({ data, error: null, refreshedAt: Date.now() });
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }).current;

  useEffect(() => {
    setState(EMPTY);
    void refresh();
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh, intervalMs, key]);

  return { ...state, refresh };
}

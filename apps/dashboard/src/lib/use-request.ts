import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
} from "react";

export interface RequestState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

/**
 * Runs `fetcher` on mount and whenever `deps` change. Errors are already toasted by the API client; they are kept
 * here so a page can tell "not loaded" from "empty". Only the latest request may update the state, so a slow
 * response for old filters cannot overwrite a newer one.
 */
export function useRequest<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
): RequestState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const latestRequest = useRef(0);

  // `fetcher` only changes meaningfully when `deps` do, so they are the callback's dependencies.
  const reload = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const result = await fetcher();
      if (requestId !== latestRequest.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

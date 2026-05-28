import { useEffect, useState } from "react";
import { getCachedResource, setCachedResource } from "../lib/resourceCache";

export function useResource<T>(cacheKey: string, loader: () => Promise<T>, deps: unknown[] = [], enabled = true) {
  const [data, setDataState] = useState<T | null>(() => getCachedResource<T>(cacheKey) ?? null);
  const [loading, setLoading] = useState(() => enabled && !getCachedResource<T>(cacheKey));
  const [error, setError] = useState<string | null>(null);

  function setData(value: T) {
    setCachedResource(cacheKey, value);
    setDataState(value);
  }

  async function refresh() {
    if (!enabled) {
      return data as T;
    }
    const result = await loader();
    setData(result);
    setError(null);
    setLoading(false);
    return result;
  }

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }
    const cached = getCachedResource<T>(cacheKey);
    if (cached) {
      setDataState(cached);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
      setError(null);
    }
    loader()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...deps, enabled]);

  return { data, setData, loading, error, refresh };
}

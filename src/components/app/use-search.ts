"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Debounced async lookup keyed by `key` (null = idle). Results are tagged with the key they
 * belong to, so stale responses never overwrite newer ones and `loading` needs no extra state.
 */
export function useSearch<T>(key: string | null, fetcher: () => Promise<T>, delay = 200) {
  const [res, setRes] = useState<{ key: string; data: T } | null>(null);
  const fetchRef = useRef(fetcher);
  useEffect(() => {
    fetchRef.current = fetcher;
  });
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const data = await fetchRef.current();
        if (alive) setRes({ key, data });
      } catch {
        /* network errors leave the previous results in place */
      }
    }, delay);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, delay]);
  return { data: res?.data ?? null, loading: key !== null && res?.key !== key, fresh: res?.key === key };
}

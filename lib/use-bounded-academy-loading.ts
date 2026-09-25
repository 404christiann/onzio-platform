"use client";

import { useEffect, useState } from "react";

/** Keep optional academy sections from showing a permanent loader on a stalled read. */
export function useBoundedAcademyLoading(loading: boolean, key: string, timeoutMs = 2_500) {
  const [expiredKey, setExpiredKey] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setExpiredKey(key), timeoutMs);
    return () => clearTimeout(timer);
  }, [key, loading, timeoutMs]);

  return loading && expiredKey !== key;
}

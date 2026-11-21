// TELEMETRY-01: best-effort, per-instance fixed-window limiter that sheds
// floods before they reach the database. The authoritative limits live in
// onzio_private.record_page_event, because serverless instances share nothing.

export type FixedWindowLimiter = {
  /** Counts one hit for the key and returns false once the key is over the limit. */
  allow(key: string, now?: number): boolean;
  size(): number;
};

export function createFixedWindowLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys: number;
}): FixedWindowLimiter {
  const windows = new Map<string, { start: number; hits: number }>();

  return {
    allow(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.start >= options.windowMs) {
        if (!current && windows.size >= options.maxKeys) {
          // Drop expired windows first; if every key is live, forget the oldest.
          for (const [existing, value] of windows) {
            if (now - value.start >= options.windowMs) windows.delete(existing);
          }
          if (windows.size >= options.maxKeys) {
            const oldest = windows.keys().next().value;
            if (oldest !== undefined) windows.delete(oldest);
          }
        }
        windows.delete(key);
        windows.set(key, { start: now, hits: 1 });
        return true;
      }
      current.hits += 1;
      return current.hits <= options.limit;
    },
    size() {
      return windows.size;
    },
  };
}

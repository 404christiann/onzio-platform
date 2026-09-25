/**
 * A failed server hero read should not keep the academy homepage veiled while
 * its client retry waits. Settle the veil after a bounded wait, but retain the
 * pending read so a late tenant-specific hero can still replace neutral copy.
 */
export const ACADEMY_HERO_CONTENT_FALLBACK_MS = 1_000;

export function loadAcademyHeroContent<T>({
  read,
  onContent,
  onReady,
  onError,
  timeoutMs = ACADEMY_HERO_CONTENT_FALLBACK_MS,
}: {
  read: () => Promise<T>;
  onContent: (content: T) => void;
  onReady: () => void;
  onError: (error: unknown) => void;
  timeoutMs?: number;
}): () => void {
  let active = true;
  let ready = false;
  const settle = () => {
    if (!active || ready) return;
    ready = true;
    onReady();
  };
  const timeout = setTimeout(settle, timeoutMs);

  Promise.resolve()
    .then(read)
    .then((content) => {
      if (active) onContent(content);
    })
    .catch((error: unknown) => {
      if (active) onError(error);
    })
    .finally(() => {
      clearTimeout(timeout);
      settle();
    });

  return () => {
    active = false;
    clearTimeout(timeout);
  };
}

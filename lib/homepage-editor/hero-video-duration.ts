export const DURATION_READ_TIMEOUT_MS = 5_000;

/**
 * Reads a video file's duration in seconds in the browser, without uploading anything. It loads only the metadata into
 * an off-DOM <video>. It resolves `undefined` when the duration cannot be known: the browser cannot decode the file
 * (some HEVC .mov in Chrome), no metadata arrives within the timeout, the duration is not a finite positive number, or
 * there is no DOM. The object URL is always revoked. The server re-checks the real length at finalize, so `undefined`
 * only means this early check is skipped.
 */
export function readVideoDuration(file: Blob, timeoutMs = DURATION_READ_TIMEOUT_MS): Promise<number | undefined> {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return Promise.resolve(undefined);
  return new Promise<number | undefined>(resolve => {
    const video = document.createElement("video");
    let url: string | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (seconds: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      if (url) URL.revokeObjectURL(url);
      resolve(seconds);
    };
    timer = setTimeout(() => finish(undefined), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    video.onerror = () => finish(undefined);
    try {
      url = URL.createObjectURL(file);
      video.src = url;
    } catch {
      finish(undefined);
    }
  });
}

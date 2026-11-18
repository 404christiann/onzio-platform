const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);
const EMBED_HOSTS = new Set([...WATCH_HOSTS, "www.youtube-nocookie.com", "youtube-nocookie.com"]);

/** Canonical form stored for a match replay. The database check mirrors this exact shape. */
export const MATCH_REPLAY_EMBED_PATTERN = /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}\?rel=0$/;

function videoId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "youtu.be") return segments.length === 1 ? segments[0] : null;
  if (WATCH_HOSTS.has(url.hostname) && segments.length === 1 && segments[0] === "watch") return url.searchParams.get("v");
  if (WATCH_HOSTS.has(url.hostname) && segments.length === 2 && segments[0] === "live") return segments[1];
  if (EMBED_HOSTS.has(url.hostname) && segments.length === 2 && segments[0] === "embed") return segments[1];
  return null;
}

/**
 * Turns a pasted YouTube link (watch, youtu.be, live or embed) into the stored embed link.
 * Returns "" for a blank field and null for anything that is not a single HTTPS YouTube video.
 */
export function matchReplayEmbedUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const id = videoId(url);
  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/embed/${id}?rel=0` : null;
}

/** The YouTube watch page for a stored embed link (the match stream or replay), or "" for anything else. */
export function youtubeWatchUrl(embed: string | null | undefined): string {
  return embed && MATCH_REPLAY_EMBED_PATTERN.test(embed) ? `https://www.youtube.com/watch?v=${embed.slice(30, 41)}` : "";
}

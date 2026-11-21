import { createHash } from "node:crypto";

/**
 * Server-side Bunny Stream management client. Server-only: it reads
 * BUNNY_STREAM_API_KEY, which must never reach the browser. The key is never
 * returned, logged, or placed in an error message.
 */

export const BUNNY_STREAM_LIBRARY_ID = "723074";
const API_BASE = `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}`;
export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
/** The hero renderer only plays play_720p.mp4, so nothing above 720p is ever built. */
export const HERO_VIDEO_RESOLUTIONS = "240p,360p,480p,720p";

export class BunnyStreamError extends Error {
  readonly status: number;
  constructor(status: number, operation: string) {
    super(`Bunny Stream ${operation} failed with status ${status}`);
    this.name = "BunnyStreamError";
    this.status = status;
  }
}

export type BunnyVideo = {
  guid: string;
  collectionId: string;
  status: number;
  availableResolutions: string[];
  hasMP4Fallback: boolean;
  width: number;
  height: number;
  /** Bytes Bunny stores for the video (original plus renditions). */
  storageSize: number;
  /** Duration in seconds as Bunny measured it; 0 until Bunny has read the file. */
  length: number;
  dateUploaded: string;
  /** 0–100 while Bunny reports it. Null when the field is missing. */
  encodeProgress: number | null;
};

export type BunnyCollectionVideo = { guid: string; status: number; storageSize: number; dateUploaded: string };

export type BunnyUploadAuthorization = {
  endpoint: string;
  libraryId: string;
  videoId: string;
  expire: number;
  signature: string;
  /** Sent as the tus EnabledResolutions header so Bunny only builds the renditions the hero needs. */
  enabledResolutions: string;
};

/**
 * Whether a video can serve the hero, decided only from the Stream API's own
 * video object. Never from the CDN: the pull zone has security on and answers
 * an anonymous request with 403, so a probe there can never succeed.
 */
export type HeroVideoReadiness =
  | { status: "ready" }
  | { status: "not_ready"; reason: "encoding" }
  | { status: "failed"; reason: "failed" | "mp4_missing" | "resolution_missing" };

export function isBunnyStreamConfigured() {
  return Boolean(process.env.BUNNY_STREAM_API_KEY);
}

function apiKey() {
  const key = process.env.BUNNY_STREAM_API_KEY;
  if (!key) throw new BunnyStreamError(0, "configuration");
  return key;
}

async function call(operation: string, path: string, init: { method?: string; body?: unknown } = {}, okStatuses: number[] = []) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      AccessKey: apiKey(),
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!response.ok && !okStatuses.includes(response.status)) throw new BunnyStreamError(response.status, operation);
  return response;
}

export async function findOrCreateCollection(clubId: string): Promise<string> {
  const name = `club-${clubId}`;
  const found = await call("collection lookup", `/collections?search=${encodeURIComponent(name)}&itemsPerPage=100`);
  const body = (await found.json()) as { items?: Array<{ guid: string; name: string }> };
  const match = body.items?.find((item) => item.name === name);
  if (match) return match.guid;
  const created = await call("collection create", "/collections", { method: "POST", body: { name } });
  return ((await created.json()) as { guid: string }).guid;
}

export async function createVideo(input: { title: string; collectionId: string }): Promise<string> {
  const response = await call("video create", "/videos", { method: "POST", body: { title: input.title, collectionId: input.collectionId } });
  return ((await response.json()) as { guid: string }).guid;
}

export async function getVideo(guid: string): Promise<BunnyVideo | null> {
  const response = await call("video lookup", `/videos/${encodeURIComponent(guid)}`, {}, [404]);
  if (response.status === 404) return null;
  const raw = (await response.json()) as Record<string, unknown>;
  const resolutions = typeof raw.availableResolutions === "string"
    ? raw.availableResolutions.split(",").map((value) => value.trim()).filter(Boolean)
    : Array.isArray(raw.availableResolutions) ? raw.availableResolutions.map(String) : [];
  return {
    guid: String(raw.guid ?? guid),
    collectionId: String(raw.collectionId ?? ""),
    status: Number(raw.status ?? 0),
    availableResolutions: resolutions,
    hasMP4Fallback: raw.hasMP4Fallback === true,
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    storageSize: Number(raw.storageSize ?? 0) || 0,
    length: Number(raw.length ?? 0) || 0,
    dateUploaded: typeof raw.dateUploaded === "string" ? raw.dateUploaded : "",
    encodeProgress: typeof raw.encodeProgress === "number" && Number.isFinite(raw.encodeProgress) ? Math.max(0, Math.min(100, Math.round(raw.encodeProgress))) : null,
  };
}

export async function listCollectionVideos(collectionId: string): Promise<BunnyCollectionVideo[]> {
  const response = await call("collection video list", `/videos?collection=${encodeURIComponent(collectionId)}&itemsPerPage=100`);
  const body = (await response.json()) as { items?: Array<{ guid: string; status?: number; storageSize?: number; dateUploaded?: string }> };
  return (body.items ?? []).map((item) => ({
    guid: item.guid, status: Number(item.status ?? 0), storageSize: Number(item.storageSize ?? 0) || 0, dateUploaded: item.dateUploaded ?? "",
  }));
}

export async function deleteVideo(guid: string): Promise<true> {
  await call("video delete", `/videos/${encodeURIComponent(guid)}`, { method: "DELETE" }, [404]);
  return true;
}

export function tusUploadAuthorization(videoGuid: string, expiresAtUnix: number): BunnyUploadAuthorization {
  const signature = createHash("sha256").update(`${BUNNY_STREAM_LIBRARY_ID}${apiKey()}${expiresAtUnix}${videoGuid}`).digest("hex");
  return { endpoint: BUNNY_TUS_ENDPOINT, libraryId: BUNNY_STREAM_LIBRARY_ID, videoId: videoGuid, expire: expiresAtUnix, signature, enabledResolutions: HERO_VIDEO_RESOLUTIONS };
}

/**
 * Pure. Reads the video object the Stream API returned (GET /videos/{guid}), makes no request.
 *
 * Video API VideoModelStatus: 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding,
 * 4 Finished, 5 Error, 6 UploadFailed, 7 JitSegmenting, 8 JitPlaylistsCreated.
 * The webhook's Status numbers differ (there, 3 is Finished), so 3 here is still encoding.
 * Only 4 is final. A status this code does not know is treated as still encoding,
 * never as a failure, because failing deletes the video.
 *
 * Once Finished, the hero needs the 720p rendition (availableResolutions lists the
 * renditions that finished encoding) and the MP4 fallback (hasMP4Fallback) the
 * renderer plays. Missing either will not fix itself, so that is a failure, not a wait.
 */
export function videoReadiness(video: BunnyVideo): HeroVideoReadiness {
  if (video.status === 5 || video.status === 6) return { status: "failed", reason: "failed" };
  if (video.status !== 4) return { status: "not_ready", reason: "encoding" };
  if (!video.availableResolutions.includes("720p")) return { status: "failed", reason: "resolution_missing" };
  if (!video.hasMP4Fallback) return { status: "failed", reason: "mp4_missing" };
  return { status: "ready" };
}

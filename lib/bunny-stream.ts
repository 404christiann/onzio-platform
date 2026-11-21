import { createHash } from "node:crypto";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";

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
  dateUploaded: string;
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

export type VideoReadiness = "ready" | "processing" | "failed" | "resolution_too_low";

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
    dateUploaded: typeof raw.dateUploaded === "string" ? raw.dateUploaded : "",
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
 * Finished (4) with MP4 fallback and a 720p rendition, and the 720p MP4 is
 * actually reachable on the pull zone. 5 and 6 are Bunny's failure states.
 */
export async function videoReadiness(video: BunnyVideo): Promise<VideoReadiness> {
  if (video.status === 5 || video.status === 6) return "failed";
  if (video.status !== 4) return "processing";
  if (!video.availableResolutions.includes("720p")) return "resolution_too_low";
  if (!video.hasMP4Fallback) return "processing";
  try {
    const head = await fetch(bunnyVideoMp4Url(video.guid, "720p"), { method: "HEAD" });
    return head.ok ? "ready" : "processing";
  } catch {
    return "processing";
  }
}

export async function isMp4FallbackReady(video: BunnyVideo): Promise<boolean> {
  return (await videoReadiness(video)) === "ready";
}

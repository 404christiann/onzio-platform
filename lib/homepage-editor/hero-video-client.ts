/**
 * Browser client for the Rose City hero video swap endpoint. Every request to
 * /api/admin/homepage/hero-video lives here so the contract is adjusted in one
 * place. Errors come back as `{ code, message }`; they surface as HeroVideoApiError.
 */

import type { HeroEffective, HeroStoredPhase } from "@/lib/hero-video-lifecycle";

const ENDPOINT = "/api/admin/homepage/hero-video";

export type HeroVideoStatus = {
  liveGuid: string;
  previousGuid: string;
  replacesUsedToday: number;
  replacesPerDay: number;
  maxBytes: number;
  maxSeconds: number;
  /** The club's current row. GET is read-only; effective is computed on the server. */
  pending?: {
    videoGuid: string;
    encodeProgress: number | null;
    phase?: HeroStoredPhase;
    effective?: HeroEffective;
    deadlineAt?: string | null;
  } | null;
  failure?: { code: string } | null;
  /** Set after the swap, so a returning tab can move the editor's base revision. */
  completion?: { videoGuid: string; revisionBefore: string | null; revisionAfter: string | null } | null;
};

export type HeroVideoUploadTicket = {
  endpoint: string;
  libraryId: string | number;
  videoId: string;
  expire: string | number;
  signature: string;
  enabledResolutions: string;
};

export type HeroVideoStart = { videoGuid: string; upload: HeroVideoUploadTicket; maxBytes: number };
/** revisionBefore/After are non-null only when this request actually wrote the homepage. */
export type HeroVideoLive = { status: "live"; liveGuid: string; previousGuid: string; revisionBefore?: string | null; revisionAfter?: string | null };
export type HeroVideoEventReply = { outcome: string };

export class HeroVideoApiError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus: number) { super(message); this.name = "HeroVideoApiError"; }
}

async function read(response: Response): Promise<{ body: Record<string, unknown>; status: number }> {
  let body: Record<string, unknown> = {};
  try { body = await response.json() as Record<string, unknown>; } catch { /* non-JSON body: handled by status below */ }
  if (!response.ok) {
    const code = typeof body.code === "string" ? body.code : "REQUEST_FAILED";
    const message = typeof body.message === "string" ? body.message : "The request failed.";
    throw new HeroVideoApiError(code, message, response.status);
  }
  return { body, status: response.status };
}

async function post(payload: Record<string, unknown>) {
  return read(await fetch(ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
}

export async function getHeroVideoStatus(): Promise<HeroVideoStatus> {
  return (await read(await fetch(ENDPOINT, { credentials: "same-origin", cache: "no-store" }))).body as unknown as HeroVideoStatus;
}

/** `durationSeconds` is sent only when the browser could read it; the server re-checks Bunny's real length at finalize. */
export async function startHeroVideoUpload(file: { name: string; size: number; type: string; durationSeconds?: number }): Promise<HeroVideoStart> {
  const payload = { action: "start", fileName: file.name, fileSize: file.size, mimeType: file.type, ...(file.durationSeconds === undefined ? {} : { durationSeconds: file.durationSeconds }) };
  return (await post(payload)).body as unknown as HeroVideoStart;
}

/** Tells the server the bytes arrived. A stale reply means a newer upload already replaced this one. */
export async function markHeroVideoUploaded(videoGuid: string): Promise<HeroVideoEventReply> {
  return (await post({ action: "uploaded", videoGuid })).body as unknown as HeroVideoEventReply;
}

/** Drops an upload that was canceled or failed before the bytes were stored. Stale means land already won. */
export async function abandonHeroVideoUpload(videoGuid: string): Promise<HeroVideoEventReply> {
  return (await post({ action: "abandon", videoGuid })).body as unknown as HeroVideoEventReply;
}

export async function revertHeroVideo(expectedLiveGuid: string, targetGuid: string): Promise<HeroVideoLive> {
  return (await post({ action: "revert", expectedLiveGuid, targetGuid })).body as unknown as HeroVideoLive;
}

/** The homepage revision the editor sends as expectedRevision on Save (the same GET the editor loads from). */
export async function fetchHomepageRevision(): Promise<string> {
  const response = await fetch("/api/admin/homepage", { credentials: "same-origin", cache: "no-store" });
  const body = await response.json() as { revision?: unknown; error?: { message?: string } };
  if (!response.ok || typeof body.revision !== "string") throw new Error(body.error?.message ?? "Could not read the latest homepage version.");
  return body.revision;
}

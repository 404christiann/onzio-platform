/**
 * Browser client for the Rose City hero video swap endpoint. Every request to
 * /api/admin/homepage/hero-video lives here so the contract is adjusted in one
 * place. Errors come back as `{ code, message }`; they surface as HeroVideoApiError.
 */

const ENDPOINT = "/api/admin/homepage/hero-video";

export type HeroVideoStatus = {
  liveGuid: string;
  previousGuid: string;
  replacesUsedToday: number;
  replacesPerDay: number;
  maxBytes: number;
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
export type HeroVideoFinalize = { status: "processing" } | HeroVideoLive;

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

export async function startHeroVideoUpload(file: { name: string; size: number; type: string }): Promise<HeroVideoStart> {
  return (await post({ action: "start", fileName: file.name, fileSize: file.size, mimeType: file.type })).body as unknown as HeroVideoStart;
}

/** 202 means Bunny is still preparing the video; 200 means the swap is live. */
export async function finalizeHeroVideo(videoGuid: string): Promise<HeroVideoFinalize> {
  const { body, status } = await post({ action: "finalize", videoGuid });
  return (status === 200 && body.status === "live" ? body : { status: "processing" }) as HeroVideoFinalize;
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

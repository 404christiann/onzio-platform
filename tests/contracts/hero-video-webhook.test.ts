import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyBunnyStreamStatus, verifyBunnyStreamSignature } from "@/lib/bunny-stream-webhook";

const m = vi.hoisted(() => ({
  rpc: vi.fn(), maybeSingle: vi.fn(),
  findOrCreateCollection: vi.fn(), createVideo: vi.fn(), getVideo: vi.fn(), listCollectionVideos: vi.fn(),
  deleteVideo: vi.fn(), tusUploadAuthorization: vi.fn(), videoReadiness: vi.fn(),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({
    schema: () => ({ rpc: m.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }) }),
  }),
}));
vi.mock("@/lib/bunny-stream", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bunny-stream")>();
  return {
    ...actual,
    findOrCreateCollection: m.findOrCreateCollection, createVideo: m.createVideo, getVideo: m.getVideo,
    listCollectionVideos: m.listCollectionVideos, deleteVideo: m.deleteVideo,
    tusUploadAuthorization: m.tusUploadAuthorization, videoReadiness: m.videoReadiness,
  };
});

import { POST } from "@/app/api/webhooks/bunny-stream/route";
import { GET } from "@/app/api/cron/hero-video/route";
import { applyBunnyStreamWebhook, getHeroVideoState, runHeroVideoBackstop } from "@/lib/hero-video-swap";

const SECRET = "read-only-library-key";
const CLUB = "11111111-1111-4111-8111-111111111111";
const COL = "col-1";
const NEW = "00000000-0000-4000-8000-000000000001";
const OLD = "00000000-0000-4000-8000-000000000002";
const PREV = "00000000-0000-4000-8000-000000000003";
const swapped = { outcome: "swapped", live_guid: NEW, previous_guid: OLD, deletable_guid: PREV, revision_before: "r1", revision_after: "r2" };

function sign(raw: string, secret = SECRET) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}
function event(status: number, guid = NEW, library = 723074) {
  return JSON.stringify({ VideoLibraryId: library, VideoGuid: guid, Status: status });
}
function headers(raw: string, extra: Record<string, string> = {}) {
  return { "x-bunnystream-signature": sign(raw), "x-bunnystream-signature-version": "v1", "x-bunnystream-signature-algorithm": "hmac-sha256", ...extra };
}
const rpcByName = (map: Record<string, unknown>) => m.rpc.mockImplementation(async (name: string) => ({ data: name in map ? map[name] : null, error: null }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("BUNNY_STREAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("BUNNY_STREAM_API_KEY", "k");
  m.findOrCreateCollection.mockResolvedValue(COL);
  m.listCollectionVideos.mockResolvedValue([]);
  m.deleteVideo.mockResolvedValue(true);
  m.videoReadiness.mockResolvedValue("ready");
  m.getVideo.mockImplementation(async (guid: string) => ({
    guid, collectionId: COL, status: 4, availableResolutions: ["720p"], hasMP4Fallback: true,
    width: 1280, height: 720, storageSize: 1000, length: 30, dateUploaded: "2026-11-21T00:00:00Z", encodeProgress: 100,
  }));
  m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: PREV } }, error: null });
  rpcByName({
    lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "preparing" }],
    swap_hero_video: [swapped],
    hero_video_event: [{ outcome: "swapped", delete_guid: null, phase: "live", replace_counted: true, revision_before: "r1", revision_after: "r2", used: 1, collection_id: COL }],
    read_hero_video_pending: [],
    hero_video_replaces_today: 1,
    list_hero_video_pending: [],
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Bunny Stream webhook signature", () => {
  const raw = event(3);
  it("accepts the documented v1 hmac-sha256 of the raw body", () => {
    expect(verifyBunnyStreamSignature({ rawBody: raw, signature: sign(raw), version: "v1", algorithm: "hmac-sha256", secret: SECRET })).toBe(true);
  });
  it.each([
    ["wrong secret", { signature: sign(raw, "other") }],
    ["re-serialized body", { rawBody: JSON.stringify(JSON.parse(raw)) + " " }],
    ["missing version", { version: null }],
    ["wrong version", { version: "v2" }],
    ["wrong algorithm", { algorithm: "hmac-sha1" }],
    ["uppercase hex", { signature: sign(raw).toUpperCase() }],
    ["short signature", { signature: "abcd" }],
    ["missing secret", { secret: "" }],
  ])("rejects %s", (_label, over) => {
    expect(verifyBunnyStreamSignature({ rawBody: raw, signature: sign(raw), version: "v1", algorithm: "hmac-sha256", secret: SECRET, ...over })).toBe(false);
  });
  it("classifies finished, failed, and in-progress webhook statuses separately from the video object", () => {
    expect(classifyBunnyStreamStatus(3)).toBe("ready");
    expect(classifyBunnyStreamStatus(5)).toBe("reject");
    expect(classifyBunnyStreamStatus(8)).toBe("upload_failed");
    expect(classifyBunnyStreamStatus(7)).toBe("land");
    expect(classifyBunnyStreamStatus(0)).toBe("land");
    expect(classifyBunnyStreamStatus(9)).toBe("ignore");
  });
});

describe("hero video webhook route", () => {
  function post(raw: string, headerOver?: Record<string, string> | null) {
    const init = headerOver === null ? {} : headers(raw, headerOver);
    return POST(new Request("https://alpha.example/api/webhooks/bunny-stream", { method: "POST", headers: init, body: raw }));
  }

  it("rejects a missing or wrong signature before any lookup", async () => {
    const raw = event(3);
    expect((await post(raw, null)).status).toBe(401);
    expect((await post(raw, { "x-bunnystream-signature": sign(raw, "nope") })).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.getVideo).not.toHaveBeenCalled();
  });

  it("rejects an unknown library and ignores a guid that is not this club's pending upload", async () => {
    const unknown = event(3, NEW, 999);
    expect((await post(unknown)).status).toBe(404);
    expect(m.getVideo).not.toHaveBeenCalled();
    rpcByName({ lookup_hero_video_pending: [] });
    const response = await post(event(3));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome: "ignored" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("ignores a guid whose collection is not the club collection", async () => {
    m.getVideo.mockResolvedValueOnce({ guid: NEW, collectionId: "someone-else", encodeProgress: null });
    const response = await post(event(3));
    expect(await response.json()).toMatchObject({ outcome: "ignored" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });

  it("finalizes a finished encode and is idempotent when the video is already live", async () => {
    const raw = event(3);
    m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: NEW, previousHeroVideoGuid: OLD } }, error: null });
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "preparing" }],
      hero_video_event: [{ outcome: "swapped", delete_guid: PREV, phase: "live", replace_counted: true, revision_before: "r1", revision_after: "r2", used: 1, collection_id: COL }],
    });
    const first = await post(raw);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: "live" });
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "ready", p_video_guid: NEW, p_expected: ["uploading", "preparing"] }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.deleteVideo).toHaveBeenCalledTimes(1);
    expect(m.deleteVideo).toHaveBeenCalledWith(PREV);

    m.deleteVideo.mockClear();
    m.rpc.mockClear();
    rpcByName({ lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "live" }] });
    const second = await applyBunnyStreamWebhook({ rawBody: raw, signature: sign(raw), version: "v1", algorithm: "hmac-sha256" });
    expect(second).toEqual({ httpStatus: 200, body: { received: true, outcome: "already_live" } });
    expect(m.rpc.mock.calls.some((call) => call[0] === "hero_video_event")).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });

  it("does not put a reverted video live again when Finished arrives late", async () => {
    m.maybeSingle.mockResolvedValue({ data: { presentation_config: { heroVideoGuid: OLD, previousHeroVideoGuid: NEW } }, error: null });
    rpcByName({ lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "live" }] });
    const response = await post(event(3));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome: "already_live" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.getVideo).not.toHaveBeenCalled();
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });

  it("returns 503 when Finished arrives before the MP4 is ready, so the delivery is retried", async () => {
    m.videoReadiness.mockResolvedValue("processing");
    const response = await post(event(3));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ outcome: "processing" });
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("cleans up a failed encode with the existing delete guard", async () => {
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "preparing" }],
      hero_video_event: [{ outcome: "failed", delete_guid: NEW, phase: "failed", replace_counted: true, revision_before: null, revision_after: null, used: 1, collection_id: COL }],
    });
    const response = await post(event(5));
    expect(await response.json()).toEqual({ received: true, outcome: "failed" });
    expect(m.deleteVideo).toHaveBeenCalledWith(NEW);
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "reject", p_failure_code: "VIDEO_FAILED", p_expected: ["uploading", "preparing"] }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("webhook 8 abandons the upload and does not count it as a failed encode", async () => {
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "uploading" }],
      hero_video_event: [{ outcome: "abandoned", delete_guid: NEW, phase: "abandoned", replace_counted: false, revision_before: null, revision_after: null, used: 0, collection_id: COL }],
    });
    const response = await post(event(8));
    expect(await response.json()).toEqual({ received: true, outcome: "abandoned" });
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "abandon", p_expected: ["uploading"], p_video_guid: NEW }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "hero_video_event" && call[1]?.p_event === "reject")).toBe(false);
  });

  it("a Finished webhook before the client lands still goes live through one ready event", async () => {
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "uploading" }],
      hero_video_event: [{ outcome: "swapped", delete_guid: null, phase: "live", replace_counted: true, revision_before: "r1", revision_after: "r2", used: 1, collection_id: COL }],
    });
    const response = await post(event(3));
    expect(await response.json()).toEqual({ received: true, outcome: "live" });
    const events = m.rpc.mock.calls.filter((call) => call[0] === "hero_video_event");
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({ p_event: "ready", p_expected: ["uploading", "preparing"] });
  });

  it("marks an upload progress event as preparing without swapping", async () => {
    rpcByName({
      lookup_hero_video_pending: [{ club_id: CLUB, collection_id: COL, phase: "uploading" }],
      hero_video_event: [{ outcome: "ok", delete_guid: null, phase: "preparing", replace_counted: true, revision_before: null, revision_after: null, used: 1, collection_id: COL }],
    });
    const response = await post(event(7));
    expect(await response.json()).toEqual({ received: true, outcome: "preparing" });
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "land", p_video_guid: NEW, p_expected: ["uploading"] }));
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
});

describe("pending hero video state", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const row = (phase: string, extra: Record<string, unknown> = {}) => ({
    video_guid: NEW, collection_id: COL, phase, failure_code: null, revision_before: null, revision_after: null, deadline_at: future, ...extra,
  });

  it("GET reports preparing, with a percent only when the host has one, and never deletes", async () => {
    rpcByName({ hero_video_replaces_today: 2, read_hero_video_pending: [row("preparing")] });
    m.getVideo.mockResolvedValueOnce({ guid: NEW, collectionId: COL, encodeProgress: 42 });
    const state = await getHeroVideoState(CLUB);
    expect(state.pending).toMatchObject({ videoGuid: NEW, encodeProgress: 42, phase: "preparing", effective: "preparing", deadlineAt: future });
    expect(state.failure).toBeNull();
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.some((call) => call[0] === "hero_video_event")).toBe(false);

    m.getVideo.mockResolvedValueOnce({ guid: NEW, collectionId: COL, encodeProgress: null });
    expect((await getHeroVideoState(CLUB)).pending).toMatchObject({ encodeProgress: null, effective: "preparing" });
  });

  it("a second tab's GET during an active upload leaves the video and the row intact", async () => {
    m.getVideo.mockResolvedValue({ guid: NEW, collectionId: COL, status: 0, storageSize: 0 });
    rpcByName({ hero_video_replaces_today: 1, read_hero_video_pending: [row("uploading")] });
    expect((await getHeroVideoState(CLUB)).pending).toMatchObject({ videoGuid: NEW, phase: "uploading", effective: "uploading" });
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.getVideo).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.some((call) => call[0] === "hero_video_event")).toBe(false);
  });

  it("reports an overdue upload as overdue and still deletes nothing", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    rpcByName({ hero_video_replaces_today: 0, read_hero_video_pending: [row("uploading", { deadline_at: past })] });
    expect((await getHeroVideoState(CLUB)).pending).toMatchObject({ effective: "uploading_overdue", deadlineAt: past });
    expect(m.deleteVideo).not.toHaveBeenCalled();
    rpcByName({
      hero_video_replaces_today: 0,
      read_hero_video_pending: [row("failed", { failure_code: "VIDEO_FAILED", deadline_at: null })],
    });
    expect((await getHeroVideoState(CLUB)).failure).toEqual({ code: "VIDEO_FAILED" });
  });
});

describe("hero video cron backstop", () => {
  function cron(authorization?: string) {
    return GET(new Request("https://onzio.example/api/cron/hero-video", { headers: authorization ? { authorization } : undefined }));
  }

  it("fails closed without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    delete process.env.CRON_SECRET;
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer secret")).status).toBe(401);
  });

  /** The cron sends events and the database decides. A row inside its deadline answers stale, as the SQL does. */
  const eventRows = (answer: (args: { p_event: string; p_video_guid: string }) => Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    m.rpc.mockImplementation(async (name: string, args: { p_event: string; p_video_guid: string }) => ({
      data: name === "hero_video_event"
        ? [{ delete_guid: null, phase: null, replace_counted: true, revision_before: null, revision_after: null, used: null, collection_id: COL, ...answer(args) }]
        : extra[name],
      error: null,
    }));
  const events = (event: string) => m.rpc.mock.calls.filter((call) => call[0] === "hero_video_event" && call[1]?.p_event === event);

  it("finalizes a ready pending upload and leaves a young upload with no bytes alone", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const waiting = "00000000-0000-4000-8000-000000000009";
    const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    m.getVideo.mockImplementation(async (guid: string) => ({
      guid, collectionId: COL, status: guid === waiting ? 0 : 4, storageSize: guid === waiting ? 0 : 1000,
      length: 30, availableResolutions: ["720p"], hasMP4Fallback: true, width: 1280, height: 720, encodeProgress: 100,
      dateUploaded: new Date().toISOString(),
    }));
    m.listCollectionVideos.mockResolvedValue([]);
    eventRows(({ p_event }) => (p_event === "ready" ? { outcome: "swapped", phase: "live" } : { outcome: "stale" }), {
      list_hero_video_pending: [
        { club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "preparing", deadline_at: deadline },
        { club_id: CLUB, video_guid: waiting, collection_id: COL, phase: "uploading", deadline_at: deadline },
      ],
    });
    const response = await cron("Bearer secret");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ configured: true, inspected: 2, finalized: 1, swept: 0, failed: 0 });
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "ready", p_video_guid: NEW }));
    expect(events("expire").map((call) => call[1].p_video_guid)).toEqual([waiting]);
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.some((call) => call[0] === "swap_hero_video")).toBe(false);
  });

  it("a slow upload started at 01:00 survives the 02:15 cron: the database answers stale and nothing is deleted", async () => {
    const started = Date.parse("2026-11-21T09:00:00.000Z");
    const landedAt = Date.parse("2026-11-21T10:40:00.000Z");
    const deadline = new Date(started + (2 * 60 + 15) * 60 * 1000).toISOString();
    m.getVideo.mockResolvedValue({ guid: NEW, collectionId: COL, status: 0, storageSize: 0, length: 0, dateUploaded: new Date(started).toISOString(), availableResolutions: [], hasMP4Fallback: false, width: 0, height: 0, encodeProgress: null });
    m.listCollectionVideos.mockResolvedValue([]);
    eventRows(() => ({ outcome: "stale" }), {
      list_hero_video_pending: [{ club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "uploading", deadline_at: deadline, started_at: new Date(started).toISOString() }],
    });
    const during = await runHeroVideoBackstop();
    expect(events("expire")).toHaveLength(1);
    expect(events("land")).toHaveLength(0);
    expect(m.deleteVideo).not.toHaveBeenCalled();
    expect(during.swept).toBe(0);
    expect(landedAt).toBeLessThan(Date.parse(deadline));
  });

  it("expires an upload only when the database says its deadline has passed, and Bunny still has no bytes", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const dead = "00000000-0000-4000-8000-00000000000b";
    const alive = "00000000-0000-4000-8000-00000000000c";
    m.getVideo.mockImplementation(async (guid: string) => ({
      guid, collectionId: COL, status: 0, storageSize: 0, length: 0, availableResolutions: [], hasMP4Fallback: false, width: 0, height: 0, encodeProgress: null, dateUploaded: past,
    }));
    m.listCollectionVideos.mockResolvedValue([]);
    eventRows(({ p_video_guid }) => (p_video_guid === dead ? { outcome: "abandoned", delete_guid: dead, phase: "abandoned", replace_counted: false } : { outcome: "stale" }), {
      list_hero_video_pending: [
        { club_id: CLUB, video_guid: dead, collection_id: COL, phase: "uploading", deadline_at: past },
        { club_id: CLUB, video_guid: alive, collection_id: COL, phase: "uploading", deadline_at: future },
      ],
    });
    const result = await runHeroVideoBackstop();
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "expire", p_video_guid: dead, p_expected: ["uploading"] }));
    expect(m.rpc).toHaveBeenCalledWith("hero_video_event", expect.objectContaining({ p_event: "expire", p_video_guid: alive, p_expected: ["uploading"] }));
    expect(m.deleteVideo).toHaveBeenCalledWith(dead);
    expect(m.deleteVideo).not.toHaveBeenCalledWith(alive);
    expect(result).toMatchObject({ inspected: 2, swept: 1, finalized: 0, failed: 0 });
  });

  it("an overdue upload that already has bytes lands and finishes instead of expiring", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    eventRows(({ p_event }) => (p_event === "land" ? { outcome: "ok", phase: "preparing" } : { outcome: "swapped", phase: "live" }), {
      list_hero_video_pending: [{ club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "uploading", deadline_at: past }],
    });
    const result = await runHeroVideoBackstop();
    expect(events("land")).toHaveLength(1);
    expect(events("ready")).toHaveLength(1);
    expect(events("expire")).toHaveLength(0);
    expect(result).toMatchObject({ finalized: 1, swept: 0, failed: 0 });
  });

  it("an overdue prepare that is still processing goes to the same expire event, and the failed row's video is deleted", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    m.videoReadiness.mockResolvedValue("processing");
    eventRows(() => ({ outcome: "failed", delete_guid: NEW, phase: "failed" }), {
      list_hero_video_pending: [{ club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "preparing", deadline_at: past }],
    });
    const result = await runHeroVideoBackstop();
    expect(events("expire")).toHaveLength(1);
    expect(events("expire")[0][1]).toMatchObject({ p_expected: ["preparing"], p_video_guid: NEW });
    expect(events("ready")).toHaveLength(0);
    expect(m.deleteVideo).toHaveBeenCalledWith(NEW);
    expect(result).toMatchObject({ swept: 1, finalized: 0, failed: 0 });
  });

  it("skips the run when the video host is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    const response = await cron("Bearer secret");
    expect(await response.json()).toEqual({ data: { configured: false, inspected: 0, finalized: 0, swept: 0, failed: 0 }, error: null });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("runHeroVideoBackstop counts an unexpected failure without deleting the live video", async () => {
    m.getVideo.mockRejectedValue(new Error("down"));
    rpcByName({ list_hero_video_pending: [{ club_id: CLUB, video_guid: NEW, collection_id: COL, phase: "preparing" }] });
    const result = await runHeroVideoBackstop();
    expect(result.failed).toBe(1);
    expect(m.deleteVideo).not.toHaveBeenCalled();
  });
});

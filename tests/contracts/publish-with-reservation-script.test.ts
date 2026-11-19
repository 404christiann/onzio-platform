import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media-processing", () => ({ publishAuthorizedMedia: vi.fn() }));
vi.mock("@/lib/media-quota", () => ({ reserveMediaUpload: vi.fn() }));
vi.mock("@/lib/supabase-service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("pg", () => ({ default: { Client: vi.fn() } }));

import pg from "pg";
import { ContractError } from "@/lib/contract-error";
import type { MediaAuthorization } from "@/lib/media-processing";
import { publishWithReservation, type PublishDeps } from "@/scripts/lib/publish-with-reservation";

const CLUB = "11111111-1111-4111-8111-111111111111";
const UPLOAD = "22222222-2222-4222-8222-222222222222";
const auth = {
  version: 1,
  uploadId: UPLOAD,
  clubId: CLUB,
  actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  surface: "shop",
  kind: "graphic",
  fileName: "a.png",
  mimeType: "image/png",
  claimedSize: 10,
  stagingPath: `${CLUB}/shop/${UPLOAD}.png`,
  expiresAt: 0,
} as MediaAuthorization;

function makeDeps(over: Partial<PublishDeps> = {}) {
  const deps = {
    localSql: vi.fn(() => true),
    alreadyPublished: vi.fn(async () => false),
    findReservation: vi.fn(async () => null),
    deleteExpiredReservation: vi.fn(async () => {}),
    raiseLimits: vi.fn(async () => {}),
    reserve: vi.fn(async () => ({})),
    publish: vi.fn(async () => ({ idempotent: false })),
    ...over,
  };
  return deps as typeof deps & PublishDeps;
}
const run = (d: PublishDeps) => publishWithReservation(auth, d);

describe("publishWithReservation", () => {
  it("skips the reserve when the asset is already published", async () => {
    const d = makeDeps({ alreadyPublished: vi.fn(async () => true) });
    await run(d);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.publish).toHaveBeenCalledTimes(1);
  });

  it("reserves then publishes when nothing is left over", async () => {
    const d = makeDeps();
    await run(d);
    expect(d.reserve).toHaveBeenCalledTimes(1);
    expect(d.deleteExpiredReservation).not.toHaveBeenCalled();
    expect(d.publish).toHaveBeenCalledTimes(1);
  });

  it("reuses a live leftover reservation", async () => {
    const d = makeDeps({ findReservation: vi.fn(async () => ({ clubId: CLUB, consumed: false, expired: false })) });
    await run(d);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.deleteExpiredReservation).not.toHaveBeenCalled();
    expect(d.publish).toHaveBeenCalledTimes(1);
  });

  it("replaces an expired leftover on loopback", async () => {
    const d = makeDeps({ findReservation: vi.fn(async () => ({ clubId: CLUB, consumed: false, expired: true })) });
    await run(d);
    expect(d.deleteExpiredReservation).toHaveBeenCalledWith(UPLOAD, CLUB);
    expect(d.reserve).toHaveBeenCalledTimes(1);
  });

  it("never deletes a consumed leftover or another club's row", async () => {
    const consumed = makeDeps({ findReservation: vi.fn(async () => ({ clubId: CLUB, consumed: true, expired: true })) });
    await run(consumed);
    expect(consumed.deleteExpiredReservation).not.toHaveBeenCalled();
    expect(consumed.reserve).not.toHaveBeenCalled();
    const other = makeDeps({ findReservation: vi.fn(async () => ({ clubId: "other", consumed: false, expired: true })) });
    await run(other);
    expect(other.deleteExpiredReservation).not.toHaveBeenCalled();
  });

  it("raises limits and retries once when quota refuses on loopback", async () => {
    const reserve = vi.fn().mockRejectedValueOnce(new ContractError("MEDIA_RATE_LIMITED")).mockResolvedValueOnce({});
    const d = makeDeps({ reserve });
    await run(d);
    expect(d.raiseLimits).toHaveBeenCalledWith(CLUB);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(d.publish).toHaveBeenCalledTimes(1);
  });

  it("rethrows a quota refusal on a hosted host without raising limits", async () => {
    const d = makeDeps({
      localSql: vi.fn(() => false),
      reserve: vi.fn().mockRejectedValue(new ContractError("MEDIA_QUOTA_FILES_EXCEEDED")),
    });
    await expect(run(d)).rejects.toMatchObject({ code: "MEDIA_QUOTA_FILES_EXCEEDED" });
    expect(d.raiseLimits).not.toHaveBeenCalled();
    expect(d.publish).not.toHaveBeenCalled();
  });

  it("rethrows any non-quota reserve failure, including a duplicate, on hosted", async () => {
    const d = makeDeps({
      localSql: vi.fn(() => false),
      reserve: vi.fn().mockRejectedValue(new ContractError("MEDIA_QUOTA_UNAVAILABLE", "duplicate key")),
    });
    await expect(run(d)).rejects.toMatchObject({ code: "MEDIA_QUOTA_UNAVAILABLE" });
    expect(d.publish).not.toHaveBeenCalled();
  });

  it("never runs SQL off loopback", async () => {
    const d = makeDeps({ localSql: vi.fn(() => false) });
    await run(d);
    expect(d.findReservation).not.toHaveBeenCalled();
    expect(d.deleteExpiredReservation).not.toHaveBeenCalled();
    expect(d.raiseLimits).not.toHaveBeenCalled();
    expect(pg.Client).not.toHaveBeenCalled();
  });
});

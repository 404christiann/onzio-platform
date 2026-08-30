import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { validTransparentPng } from "../fixtures/media";
import {
  expectPostgrestError,
  expectStorageError,
} from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

describe("storage isolation contract", () => {
  it("contains private staging and public media buckets", async () => {
    const { data, error } = await clients.service.storage.listBuckets();
    expect(error?.message).toBeUndefined();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "onzio-upload-staging",
          public: false,
        }),
        expect.objectContaining({ name: "onzio-media", public: true }),
      ]),
    );
  });

  it("rejects anonymous staging uploads", async () => {
    const { error } = await clients.anon.storage
      .from("onzio-upload-staging")
      .upload(
        `${CLUB_IDS.alpha}/homepage/99999999-9999-4999-8999-999999999999.png`,
        validTransparentPng(),
        { contentType: "image/png" },
      );
    expectStorageError(
      error,
      {
        statusCode: "403",
        message: "new row violates row-level security policy",
      },
      "anonymous staging upload",
    );
  });

  it("rejects malformed public-media paths", async () => {
    const { data: bucket, error: bucketError } =
      await clients.service.storage.getBucket("onzio-media");
    expect(bucketError?.message).toBeUndefined();
    expect(bucket).toMatchObject({ name: "onzio-media", public: true });

    const { error } = await clients.anon.storage
      .from("onzio-media")
      .upload("../bravo/attacker.png", validTransparentPng(), {
        contentType: "image/png",
      });
    expectStorageError(
      error,
      { statusCode: "404", message: "Bucket not found" },
      "malformed public-media path",
    );
  });

  it("rejects unsupported SVG uploads", async () => {
    const { error } = await clients.anon.storage
      .from("onzio-upload-staging")
      .upload(
        `${CLUB_IDS.alpha}/branding/99999999-9999-4999-8999-999999999999.svg`,
        Buffer.from("<svg/>"),
        { contentType: "image/svg+xml" },
      );
    expectStorageError(
      error,
      {
        statusCode: "415",
        message: "mime type image/svg+xml is not supported",
      },
      "unsupported SVG upload",
    );
  });
});

// Regression contract for the /admin media pipeline. /api/admin/media/authorize
// asks Storage to sign an upload URL before any bytes exist, so the staging
// INSERT policy is evaluated against a row with no `metadata`. A prior version
// of onzio_staging_member_insert required metadata->>'mimetype' to be a known
// image type, which is unsatisfiable at that moment — every image upload and
// replace in /admin returned MEDIA_AUTH_FAILED for every club and surface.
describe("admin media staging signed-upload contract", () => {
  const SIGNED_UPLOAD_PATHS = [
    `${CLUB_IDS.alpha}/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa901.webp`,
    `${CLUB_IDS.alpha}/programs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa902.webp`,
  ] as const;
  const CROSS_CLUB_PATH =
    `${CLUB_IDS.bravo}/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa903.webp`;
  const memberCleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (memberCleanups.length > 0) {
      await memberCleanups.pop()?.();
    }
    await clients.service.storage
      .from("onzio-upload-staging")
      .remove([...SIGNED_UPLOAD_PATHS, CROSS_CLUB_PATH]);
  });

  it.each(SIGNED_UPLOAD_PATHS)(
    "signs a staging upload for a club member at %s",
    async (path) => {
      const session = await createFreshLocalClient({
        email: "owner-aal2@alpha.local",
        userId: USER_IDS.ownerAal2,
      });
      memberCleanups.push(session.cleanup);

      const { data, error } = await session.client.storage
        .from("onzio-upload-staging")
        .createSignedUploadUrl(path, { upsert: false });

      expect(
        error?.message,
        `signing ${path} must succeed for a fresh club member`,
      ).toBeUndefined();
      expect(data?.path).toBe(path);
      expect(typeof data?.token).toBe("string");
      expect(data?.token.length ?? 0).toBeGreaterThan(0);
    },
  );

  it("still refuses to sign a staging upload for another club", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    memberCleanups.push(session.cleanup);

    const { data, error } = await session.client.storage
      .from("onzio-upload-staging")
      .createSignedUploadUrl(CROSS_CLUB_PATH, { upsert: false });

    expect(data).toBeNull();
    expectStorageError(
      error,
      {
        statusCode: "403",
        message: "new row violates row-level security policy",
      },
      "cross-club staging signed upload",
    );
  });

  it("still refuses to sign a staging upload for an anonymous caller", async () => {
    const { data, error } = await clients.anon.storage
      .from("onzio-upload-staging")
      .createSignedUploadUrl(SIGNED_UPLOAD_PATHS[0], { upsert: false });

    expect(data).toBeNull();
    expectStorageError(
      error,
      {
        statusCode: "403",
        message: "new row violates row-level security policy",
      },
      "anonymous staging signed upload",
    );
  });

  it("still refuses to sign a staging upload at a malformed path", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    memberCleanups.push(session.cleanup);

    const { data, error } = await session.client.storage
      .from("onzio-upload-staging")
      .createSignedUploadUrl(`${CLUB_IDS.alpha}/branding/attacker.exe`, {
        upsert: false,
      });

    expect(data).toBeNull();
    expectStorageError(
      error,
      {
        statusCode: "403",
        message: "new row violates row-level security policy",
      },
      "malformed staging signed upload path",
    );
  });
});

// Every /admin image surface, not just the two that happened to be checked when
// the staging INSERT policy was last repaired. MEDIA_AUTH_FAILED has now been
// reported twice, and the second report named surfaces (schedule, about,
// standings, branding) that had no coverage at all — a per-surface regression
// could hide indefinitely. `onzio_staging_member_insert` maps the path's second
// segment through a CASE whose default is 'branding', so these deliberately
// span both sides of it: contact/programs/tryouts/shop/standings hit named
// arms, about/branding/homepage/roster/schedule fall through the default.
//
// Bravo is the club under test on purpose. It is `tier=starter`, and under the
// pre-PLAT-102 model 'programs' and 'tryouts' were Pro-only feature strings
// (DCFC-D108). Those two paths succeeding for a Starter club is the direct
// proof that `onzio_private.can_mutate_feature` no longer consults its feature
// argument at all — it delegates straight to `can_mutate_content` — and
// therefore that the CASE expression in the policy, including its
// `else 'branding'` default, cannot be the cause of any upload failure.
describe("admin media staging signed-upload coverage, every surface", () => {
  const MEDIA_SURFACES = [
    "about",
    "branding",
    "contact",
    "homepage",
    "programs",
    "roster",
    "schedule",
    "shop",
    "standings",
    "tryouts",
  ] as const;

  const uploadId = (index: number) =>
    `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(9000 + index)}`;
  const pathFor = (surface: string, index: number) =>
    `${CLUB_IDS.bravo}/${surface}/${uploadId(index)}.webp`;
  const sessionCleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (sessionCleanups.length > 0) {
      await sessionCleanups.pop()?.();
    }
    await clients.service.storage
      .from("onzio-upload-staging")
      .remove(MEDIA_SURFACES.map((surface, index) => pathFor(surface, index)));
  });

  it.each(MEDIA_SURFACES.map((surface, index) => [surface, index] as const))(
    "signs a staging upload on the %s surface for a Starter club's member",
    async (surface, index) => {
      const session = await createFreshLocalClient({
        email: "admin@bravo.local",
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      });
      sessionCleanups.push(session.cleanup);

      const path = pathFor(surface, index);
      const { data, error } = await session.client.storage
        .from("onzio-upload-staging")
        .createSignedUploadUrl(path, { upsert: false });

      expect(
        error?.message,
        `the ${surface} surface must be signable: /admin cannot upload without it`,
      ).toBeUndefined();
      expect(data?.path).toBe(path);
      expect(typeof data?.token).toBe("string");
    },
  );
});

describe("database audit contract", () => {
  it("records successful content mutations without secrets", async () => {
    const marker = `audit-contract-${Date.now()}`;
    const { error } = await clients.service.from("site_branding").upsert({
      club_id: CLUB_IDS.alpha,
      club_logo_path: marker,
    });
    expect(error?.message).toBeUndefined();

    const { data, error: auditError } = await clients.service
      .from("audit_events")
      .select("club_id,operation,resource_type,payload")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("resource_type", "site_branding")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(auditError?.message).toBeUndefined();
    expect(data).toMatchObject({
      club_id: CLUB_IDS.alpha,
      operation: expect.stringMatching(/insert|update/),
      resource_type: "site_branding",
    });
    expect(JSON.stringify(data)).not.toMatch(
      /sk_(?:test|live)|whsec_|service_role/i,
    );
  });

  it("keeps audit events immutable to anonymous users", async () => {
    const update = await clients.anon
      .from("audit_events")
      .update({ operation: "forged" })
      .eq("club_id", CLUB_IDS.alpha);
    const deletion = await clients.anon
      .from("audit_events")
      .delete()
      .eq("club_id", CLUB_IDS.alpha);
    expectPostgrestError(update.error, "42501", "anonymous audit update");
    expectPostgrestError(deletion.error, "42501", "anonymous audit deletion");
  });

  it("does not record rejected writes as successful events", async () => {
    const rejected = await clients.anon.from("site_branding").insert({
      club_id: CLUB_IDS.bravo,
      club_logo_path: "rejected/logo.png",
    });
    expectPostgrestError(
      rejected.error,
      "42501",
      "rejected write audit probe",
    );

    const { data, error } = await clients.service
      .from("audit_events")
      .select("id")
      .eq("club_id", CLUB_IDS.bravo)
      .eq("resource_type", "site_branding")
      .eq("operation", "insert")
      .contains("payload", { club_logo_path: "rejected/logo.png" });

    expect(error?.message).toBeUndefined();
    expect(data).toEqual([]);
  });
});

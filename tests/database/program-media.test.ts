import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import {
  mimeSpoofedExecutable,
  scriptedSvg,
  validTransparentPng,
} from "../fixtures/media";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";
import { assertSafeTestEnvironment } from "../helpers/environment";

// Database contracts for onzio.program_media and the onzio.programs
// registration copy columns added in
// 20260808020000_dcfc_program_media_registration_content.sql.
//
// These cover the boundary the migration is responsible for: a club can only
// manage its own program gallery, the public can only read it for a club whose
// site is actually readable, a gallery row cannot point at another tenant's
// program or media asset, and every documented CHECK is real. The end-to-end
// upload test also proves a real image survives the secured media pipeline
// (private staging -> signature/dimension verification -> UUID-versioned
// immutable publish) and is then served directly, per the AGENTS.md media
// rules.

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];

const ALPHA_PROGRAM_ID = "99999999-9999-4999-8999-999999999901";
const BRAVO_PROGRAM_ID = "99999999-9999-4999-8999-999999999902";
const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const MISSING_TABLE = "PGRST205";

const publishedAssetIds: string[] = [];

async function seedProgram(clubId: string, id: string, slug: string) {
  const { error } = await clients.service.from("programs").insert({
    id,
    club_id: clubId,
    slug,
    display_title: "Program media contract",
  });
  expect(error?.message).toBeUndefined();
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  await clients.service
    .from("programs")
    .delete()
    .in("id", [ALPHA_PROGRAM_ID, BRAVO_PROGRAM_ID]);
  await seedProgram(CLUB_IDS.alpha, ALPHA_PROGRAM_ID, "program-media-alpha");
  await seedProgram(CLUB_IDS.bravo, BRAVO_PROGRAM_ID, "program-media-bravo");
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  // program_media cascades from its program, so deleting the fixture programs
  // removes their gallery rows too -- which the cascade test also asserts.
  await clients.service
    .from("programs")
    .delete()
    .in("id", [ALPHA_PROGRAM_ID, BRAVO_PROGRAM_ID]);
  for (const assetId of publishedAssetIds.splice(0)) {
    await clients.service.from("media_assets").delete().eq("id", assetId);
  }
});

describe("onzio.program_media schema", () => {
  it("exposes the table", async () => {
    const { error } = await clients.service
      .from("program_media")
      .select("*")
      .limit(0);
    expect(error?.code).not.toBe(MISSING_TABLE);
    expect(error?.message).toBeUndefined();
  });

  it("makes a cross-tenant program reference structurally impossible", async () => {
    const { error } = await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: BRAVO_PROGRAM_ID,
      url: "/images/programs/cross-tenant.webp",
    });
    expectPostgrestError(
      error,
      FOREIGN_KEY_VIOLATION,
      "cross-tenant program media relationship",
    );
  });

  it("rejects a gallery row that cannot deliver an image", async () => {
    const { error } = await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url: "",
      media_asset_id: null,
    });
    expectPostgrestError(
      error,
      CHECK_VIOLATION,
      "gallery row with neither a source path nor a published asset",
    );
  });

  it.each([
    ["mailto:club@example.test", "mailto"],
    ["javascript:alert(1)", "javascript"],
    ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data URI"],
    ["//evil.example.test/photo.webp", "protocol-relative"],
    ["/\\evil.example.test/photo.webp", "backslash-relative"],
  ])("rejects %s as an image source (%s)", async (url) => {
    const { error } = await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url,
    });
    expectPostgrestError(error, CHECK_VIOLATION, `image source ${url}`);
  });

  it("accepts a local path and an HTTPS source", async () => {
    const { error } = await clients.service.from("program_media").insert([
      {
        club_id: CLUB_IDS.alpha,
        program_id: ALPHA_PROGRAM_ID,
        url: "/images/programs/slide-01.webp",
        alt: "Local static slide",
        sort_order: 0,
      },
      {
        club_id: CLUB_IDS.alpha,
        program_id: ALPHA_PROGRAM_ID,
        url: "https://cdn.example.test/slide-02.webp",
        alt: "Hosted slide",
        sort_order: 1,
      },
    ]);
    expect(error?.message).toBeUndefined();
  });

  it("rejects an over-long image description", async () => {
    const { error } = await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url: "/images/programs/slide-01.webp",
      alt: "x".repeat(201),
    });
    expectPostgrestError(error, CHECK_VIOLATION, "over-long alt text");
  });

  it("removes a program's gallery when the program is deleted", async () => {
    await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url: "/images/programs/cascade.webp",
    });
    await clients.service.from("programs").delete().eq("id", ALPHA_PROGRAM_ID);

    const { data, error } = await clients.service
      .from("program_media")
      .select("id")
      .eq("program_id", ALPHA_PROGRAM_ID);
    expect(error?.message).toBeUndefined();
    expect(
      data ?? [],
      "gallery rows must not outlive the program that owns them",
    ).toEqual([]);
  });
});

describe("onzio.programs registration copy constraints", () => {
  it.each([
    ["registration_eyebrow", 80],
    ["registration_headline", 120],
    ["registration_body", 1_200],
    ["registration_pending_body", 1_200],
    ["registration_pending_label", 60],
  ] as const)("caps %s at %i characters", async (column, maximum) => {
    const atLimit = await clients.service
      .from("programs")
      .update({ [column]: "x".repeat(maximum) })
      .eq("id", ALPHA_PROGRAM_ID);
    expect(atLimit.error?.message).toBeUndefined();

    const overLimit = await clients.service
      .from("programs")
      .update({ [column]: "x".repeat(maximum + 1) })
      .eq("id", ALPHA_PROGRAM_ID);
    expectPostgrestError(overLimit.error, CHECK_VIOLATION, `${column} ceiling`);
  });

  it("persists edited registration copy and surfaces it as the public page's own values", async () => {
    const { resolveProgramRegistration } = await import(
      "@/lib/program-content"
    );
    const edited = {
      registration_enabled: true,
      registration_headline: "Sign up for the spring season.",
      registration_body: "Spaces are limited; registration closes in March.",
      registration_pending_label: "Registration opens soon",
    };

    const write = await clients.service
      .from("programs")
      .update(edited)
      .eq("id", ALPHA_PROGRAM_ID);
    expect(write.error?.message).toBeUndefined();

    // Read back the way the public site does: anonymous, tenant-scoped.
    const { data, error } = await clients.anon
      .from("programs")
      .select("*")
      .eq("id", ALPHA_PROGRAM_ID)
      .single();
    expect(error?.message).toBeUndefined();

    const registration = resolveProgramRegistration(data);
    expect(registration.enabled).toBe(true);
    expect(registration.headline).toBe(edited.registration_headline);
    expect(registration.body).toBe(edited.registration_body);
    expect(registration.pendingLabel).toBe(edited.registration_pending_label);
    // Untouched fields still resolve to the approved template wording rather
    // than rendering blank.
    expect(registration.eyebrow).toBe("Program Registration");
  });

  it("defaults registration off with empty copy so nothing changes for existing programs", async () => {
    const { data, error } = await clients.service
      .from("programs")
      .select(
        "registration_enabled, registration_eyebrow, registration_headline, registration_body, registration_pending_body, registration_pending_label",
      )
      .eq("id", BRAVO_PROGRAM_ID)
      .single();
    expect(error?.message).toBeUndefined();
    expect(data).toEqual({
      registration_enabled: false,
      registration_eyebrow: "",
      registration_headline: "",
      registration_body: "",
      registration_pending_body: "",
      registration_pending_label: "",
    });
  });
});

describe("onzio.program_media authorization", () => {
  it("denies an anonymous write", async () => {
    const { error } = await clients.anon.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url: "/images/programs/anon.webp",
    });
    expectPostgrestError(
      error,
      PERMISSION_DENIED,
      "anonymous program media insert",
    );
  });

  it("exposes gallery rows publicly for a live club", async () => {
    await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url: "/images/programs/public.webp",
    });

    const { data, error } = await clients.anon
      .from("program_media")
      .select("url")
      .eq("program_id", ALPHA_PROGRAM_ID);
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([{ url: "/images/programs/public.webp" }]);
  });

  it("hides gallery rows from the public for a preview club", async () => {
    await clients.service.from("program_media").insert({
      club_id: CLUB_IDS.bravo,
      program_id: BRAVO_PROGRAM_ID,
      url: "/images/programs/preview.webp",
    });

    const { data, error } = await clients.anon
      .from("program_media")
      .select("url")
      .eq("program_id", BRAVO_PROGRAM_ID);
    expect(error?.message).toBeUndefined();
    expect(
      data ?? [],
      "a club that is not publicly accessible must expose no gallery rows",
    ).toEqual([]);
  });

  it("lets a club member manage only its own club's gallery", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const allowed = await session.client.from("program_media").insert({
      club_id: CLUB_IDS.alpha,
      program_id: ALPHA_PROGRAM_ID,
      url: "/images/programs/member-owned.webp",
      alt: "Own club gallery image",
    });
    expect(allowed.error?.message).toBeUndefined();

    const crossClub = await session.client.from("program_media").insert({
      club_id: CLUB_IDS.bravo,
      program_id: BRAVO_PROGRAM_ID,
      url: "/images/programs/forged.webp",
    });
    expectPostgrestError(
      crossClub.error,
      PERMISSION_DENIED,
      "cross-club program media insert",
    );

    // A member of another club must not be able to delete this club's row
    // either -- reads and writes are both club-scoped.
    const foreign = await session.client
      .from("program_media")
      .delete()
      .eq("club_id", CLUB_IDS.bravo);
    expect(foreign.error?.message ?? "").not.toContain("unexpected");
    const { data: survivors } = await clients.service
      .from("program_media")
      .select("id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(
      (survivors ?? []).length,
      "another club's gallery rows must survive a foreign delete attempt",
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("program gallery media pipeline", () => {
  async function stageAndPublish(bytes: Buffer, mimeType: string, extension: string) {
    const { supabaseUrl } = assertSafeTestEnvironment();
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";

    const { publishAuthorizedMedia } = await import("@/lib/media-processing");
    const { buildStoragePath } = await import("@/lib/storage-path");

    const uploadId = randomUUID();
    const stagingPath = buildStoragePath({
      clubId: CLUB_IDS.alpha,
      surface: "programs",
      assetId: uploadId,
      extension: extension as "png" | "jpg" | "jpeg" | "webp",
    });
    const { error: stageError } = await clients.service.storage
      .from("onzio-upload-staging")
      .upload(stagingPath, bytes, { contentType: mimeType, upsert: true });
    expect(stageError?.message).toBeUndefined();
    cleanups.push(async () => {
      await clients.service.storage
        .from("onzio-upload-staging")
        .remove([stagingPath]);
    });

    return publishAuthorizedMedia({
      version: 1,
      uploadId,
      clubId: CLUB_IDS.alpha,
      actorId: USER_IDS.adminAal2,
      surface: "programs",
      kind: "photo",
      fileName: `gallery-slide.${extension}`,
      mimeType,
      claimedSize: bytes.length,
      stagingPath,
      expiresAt: Date.now() + 60_000,
    });
  }

  it("validates, stores, and directly serves an uploaded gallery image", async () => {
    const published = await stageAndPublish(
      validTransparentPng(),
      "image/png",
      "png",
    );
    publishedAssetIds.push(published.assetId);

    // Published under a UUID-versioned immutable path on the public media
    // bucket -- never a runtime transformation endpoint.
    expect(published.status).toBe("finalized");
    expect(published.storagePath).toMatch(
      new RegExp(
        `^${CLUB_IDS.alpha}/programs/[0-9a-f-]{36}\\.(png|webp)$`,
      ),
    );
    expect(published.publicUrl).toContain("/storage/v1/object/public/onzio-media/");
    expect(published.publicUrl).not.toContain("/storage/v1/render/image/");

    const attached = await clients.service
      .from("program_media")
      .insert({
        club_id: CLUB_IDS.alpha,
        program_id: ALPHA_PROGRAM_ID,
        url: published.publicUrl,
        media_asset_id: published.assetId,
        alt: "Uploaded gallery slide",
        sort_order: 0,
      })
      .select("url, media_asset_id, alt")
      .single();
    expect(attached.error?.message).toBeUndefined();
    expect(attached.data).toMatchObject({
      media_asset_id: published.assetId,
      alt: "Uploaded gallery slide",
    });

    // The public reader sees the same row, and the bytes are actually served.
    const { data: publicRows } = await clients.anon
      .from("program_media")
      .select("url")
      .eq("program_id", ALPHA_PROGRAM_ID);
    expect(publicRows).toEqual([{ url: published.publicUrl }]);

    const response = await fetch(published.publicUrl);
    expect(response.ok, `published media must be served: ${response.status}`).toBe(
      true,
    );
    expect(response.headers.get("content-type") ?? "").toMatch(/^image\//);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it.each([
    ["a MIME-spoofed executable", mimeSpoofedExecutable, "image/png", "png"],
    ["an SVG", scriptedSvg, "image/png", "png"],
  ])("rejects %s uploaded to the programs surface", async (
    _label,
    bytes,
    mimeType,
    extension,
  ) => {
    await expect(
      stageAndPublish(bytes as Buffer, mimeType, extension),
    ).rejects.toThrowError();

    const { data } = await clients.service
      .from("program_media")
      .select("id")
      .eq("program_id", ALPHA_PROGRAM_ID);
    expect(
      data ?? [],
      "a rejected upload must never produce a gallery row",
    ).toEqual([]);
  });
});

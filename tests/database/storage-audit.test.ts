import { beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { validTransparentPng } from "../fixtures/media";
import {
  expectPostgrestError,
  expectStorageError,
} from "../helpers/database-security";
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

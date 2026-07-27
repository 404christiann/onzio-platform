import { beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { validTransparentPng } from "../fixtures/media";
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
    expect(error).not.toBeNull();
  });

  it("rejects malformed public-media paths", async () => {
    const { error } = await clients.anon.storage
      .from("onzio-media")
      .upload("../bravo/attacker.png", validTransparentPng(), {
        contentType: "image/png",
      });
    expect(error).not.toBeNull();
  });

  it("rejects unsupported SVG uploads", async () => {
    const { error } = await clients.anon.storage
      .from("onzio-upload-staging")
      .upload(
        `${CLUB_IDS.alpha}/branding/99999999-9999-4999-8999-999999999999.svg`,
        Buffer.from("<svg/>"),
        { contentType: "image/svg+xml" },
      );
    expect(error).not.toBeNull();
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
    expect(update.error).not.toBeNull();
    expect(deletion.error).not.toBeNull();
  });

  it("does not record rejected writes as successful events", async () => {
    await clients.anon.from("site_branding").insert({
      club_id: CLUB_IDS.bravo,
      club_logo_path: "rejected/logo.png",
    });

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

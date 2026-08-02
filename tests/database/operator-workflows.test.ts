import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
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

describe("operator workflow database contract", () => {
  it("keeps verified export records private from browser roles", async () => {
    const { data, error } = await clients.anon.from("club_exports").select("*");
    expectPostgrestError(error, "42501", "anonymous export-ledger read");
    expect(data).toBeNull();

    const insert = await clients.anon.from("club_exports").insert({
      id: `forged_${randomUUID()}`,
      club_id: randomUUID(),
      club_slug: "forged",
      checksum_sha256: "a".repeat(64),
      object_count: 0,
      row_count: 0,
      storage_reference: "forged",
      created_by: USER_IDS.ownerAal2,
    });
    expectPostgrestError(
      insert.error,
      "42501",
      "anonymous export-ledger insert",
    );
  });

  it("preserves immutable audit and Stripe ledgers outside purged tenant data", async () => {
    const clubId = randomUUID();
    const slug = `purge-ledger-${clubId.slice(0, 8)}`;
    const eventId = `evt_${randomUUID()}`;

    const clubInsert = await clients.service.from("clubs").insert({
      id: clubId,
      slug,
      name: "Purge Ledger Fixture",
      lifecycle: "archived",
      public_access: "suspended",
      tier: "starter",
      archived_at: new Date().toISOString(),
    });
    expect(clubInsert.error?.message).toBeUndefined();

    const stripeInsert = await clients.service.from("stripe_events").insert({
      id: eventId,
      club_id: clubId,
      environment: "test",
      event_type: "customer.subscription.deleted",
      stripe_created_at: new Date().toISOString(),
      outcome: "applied",
      payload_digest: "a".repeat(64),
    });
    expect(stripeInsert.error?.message).toBeUndefined();

    const auditInsert = await clients.service.from("audit_events").insert({
      club_id: clubId,
      actor_user_id: USER_IDS.ownerAal2,
      actor_type: "operator",
      operation: "archive",
      resource_type: "club",
      resource_id: clubId,
      payload: {},
    });
    expect(auditInsert.error?.message).toBeUndefined();

    const deletion = await clients.service.from("clubs").delete().eq("id", clubId);
    expect(deletion.error?.message).toBeUndefined();

    const { data: stripe } = await clients.service
      .from("stripe_events")
      .select("club_id")
      .eq("id", eventId)
      .single();
    const { data: audit } = await clients.service
      .from("audit_events")
      .select("club_id")
      .eq("resource_type", "club")
      .eq("resource_id", clubId)
      .eq("operation", "archive")
      .single();
    expect(stripe?.club_id).toBeNull();
    expect(audit?.club_id).toBeNull();
  });
});

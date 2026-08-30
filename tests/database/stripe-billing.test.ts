import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expectPostgrestError } from "../helpers/database-security";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;
const clubIds: string[] = [];

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  for (const clubId of clubIds.splice(0)) {
    await clients.service.from("club_subscriptions").delete().eq("club_id", clubId);
    await clients.service.from("clubs").delete().eq("id", clubId);
  }
});

async function createClub(input: {
  lifecycle?: "onboarding" | "active";
  kind?: "customer" | "demo" | "test";
  priceId?: string | null;
} = {}) {
  const id = randomUUID();
  clubIds.push(id);
  const lifecycle = input.lifecycle ?? "onboarding";
  const { error } = await clients.service.from("clubs").insert({
    id,
    slug: `stripe-${id.slice(0, 8)}`,
    name: "Stripe Contract Club",
    lifecycle,
    public_access: "preview",
    tier: "starter",
    kind: input.kind ?? "customer",
    stripe_price_id:
      input.priceId === undefined ? "price_contract_customer" : input.priceId,
  });
  expect(error?.message).toBeUndefined();
  return id;
}

function projectionArgs(
  clubId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    p_event_id: `evt_${randomUUID()}`,
    p_event_type: "customer.subscription.updated",
    p_stripe_created_at: new Date().toISOString(),
    p_environment: "test",
    p_club_id: clubId,
    p_customer_id: `cus_${randomUUID()}`,
    p_subscription_id: `sub_${randomUUID()}`,
    p_price_id: "price_contract_customer",
    p_status: "active",
    p_cancel_at_period_end: false,
    p_paid_through: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    p_grace_ends_at: null,
    p_public_access: "live",
    p_payload_digest: "b".repeat(64),
    ...overrides,
  };
}

describe("PLAT-102 Stripe billing database contract", () => {
  it("atomically applies arbitrary Stripe facts without changing dormant tier metadata", async () => {
    const clubId = await createClub();
    const args = projectionArgs(clubId, {
      p_price_id: "price_negotiated_reported_by_stripe",
    });
    const { data, error } = await clients.service.rpc("apply_stripe_projection", args);
    expect(error?.message).toBeUndefined();
    expect(data).toMatchObject({ action: "applied", eventId: args.p_event_id });

    const { data: club } = await clients.service
      .from("clubs")
      .select("lifecycle,public_access,tier,stripe_price_id,kind")
      .eq("id", clubId)
      .single();
    const { data: subscription } = await clients.service
      .from("club_subscriptions")
      .select("price_id,tier,status,last_applied_stripe_event_id")
      .eq("club_id", clubId)
      .single();

    expect(club).toEqual({
      lifecycle: "active",
      public_access: "live",
      tier: "starter",
      stripe_price_id: "price_contract_customer",
      kind: "customer",
    });
    expect(subscription).toEqual({
      price_id: "price_negotiated_reported_by_stripe",
      tier: null,
      status: "active",
      last_applied_stripe_event_id: args.p_event_id,
    });
  });

  it("rejects billing projection for demo and test clubs", async () => {
    for (const kind of ["demo", "test"] as const) {
      const clubId = await createClub({ kind, priceId: null });
      const args = projectionArgs(clubId);
      const result = await clients.service.rpc("apply_stripe_projection", args);
      expect(result.error?.message).toBeUndefined();
      expect(result.data).toEqual({ action: "rejected", code: "BILLING_NOT_REQUIRED" });
    }
  });

  it("rejects duplicate and stale events without changing the projection", async () => {
    const clubId = await createClub();
    const initial = projectionArgs(clubId, {
      p_stripe_created_at: "2026-07-26T12:00:00.000Z",
    });
    expect((await clients.service.rpc("apply_stripe_projection", initial)).error).toBeNull();

    const duplicate = await clients.service.rpc("apply_stripe_projection", initial);
    expect(duplicate.data).toEqual({ action: "rejected", code: "DUPLICATE_EVENT" });

    const stale = projectionArgs(clubId, {
      p_stripe_created_at: "2026-07-26T11:59:59.000Z",
      p_customer_id: initial.p_customer_id,
      p_subscription_id: initial.p_subscription_id,
      p_price_id: "price_later_contract",
    });
    const staleResult = await clients.service.rpc("apply_stripe_projection", stale);
    expect(staleResult.data).toEqual({ action: "rejected", code: "STALE_EVENT" });
    const { data: subscription } = await clients.service
      .from("club_subscriptions")
      .select("price_id,last_applied_stripe_event_id")
      .eq("club_id", clubId)
      .single();
    expect(subscription).toEqual({
      price_id: "price_contract_customer",
      last_applied_stripe_event_id: initial.p_event_id,
    });
  });

  it("emits idempotent day-7/day-17 warnings and honors the suspension kill switch", async () => {
    const clubId = await createClub({ lifecycle: "active" });
    const args = projectionArgs(clubId, {
      p_status: "past_due",
      p_paid_through: "2026-08-01T00:00:00.000Z",
      p_grace_ends_at: "2026-08-21T00:00:00.000Z",
      p_public_access: "grace",
    });
    expect((await clients.service.rpc("apply_stripe_projection", args)).error).toBeNull();

    const first = await clients.service.rpc("run_billing_lifecycle", {
      p_now: "2026-08-18T00:00:00.000Z",
      p_suspension_enabled: false,
      p_reconciliation_enabled: true,
    });
    expect(first.data).toEqual({ warnings: 2, suspensions: 0, divergences: 0 });
    const repeat = await clients.service.rpc("run_billing_lifecycle", {
      p_now: "2026-08-18T00:00:00.000Z",
      p_suspension_enabled: false,
      p_reconciliation_enabled: true,
    });
    expect(repeat.data).toEqual({ warnings: 0, suspensions: 0, divergences: 0 });

    const disabled = await clients.service.rpc("run_billing_lifecycle", {
      p_now: "2026-08-22T00:00:00.000Z",
      p_suspension_enabled: false,
      p_reconciliation_enabled: true,
    });
    expect(disabled.data).toEqual({ warnings: 0, suspensions: 0, divergences: 0 });
    expect(
      (await clients.service.from("clubs").select("public_access").eq("id", clubId).single()).data,
    ).toEqual({ public_access: "grace" });

    const enabled = await clients.service.rpc("run_billing_lifecycle", {
      p_now: "2026-08-22T00:00:00.000Z",
      p_suspension_enabled: true,
      p_reconciliation_enabled: true,
    });
    expect(enabled.data).toEqual({ warnings: 0, suspensions: 1, divergences: 0 });
    expect(
      (await clients.service.from("clubs").select("public_access").eq("id", clubId).single()).data,
    ).toEqual({ public_access: "suspended" });
  });

  it("reports Price drift on every run but appends only one audit per observed pair", async () => {
    const clubId = await createClub({ lifecycle: "active" });
    const args = projectionArgs(clubId, { p_price_id: "price_drifted" });
    expect((await clients.service.rpc("apply_stripe_projection", args)).error).toBeNull();
    for (let index = 0; index < 2; index += 1) {
      const result = await clients.service.rpc("run_billing_lifecycle", {
        p_now: "2026-08-03T00:00:00.000Z",
        p_suspension_enabled: false,
        p_reconciliation_enabled: true,
      });
      expect(result.data).toMatchObject({ divergences: 1 });
    }
    const { data: audits } = await clients.service
      .from("audit_events")
      .select("operation,payload")
      .eq("club_id", clubId)
      .eq("operation", "billing_reconciliation_divergence");
    expect(audits).toHaveLength(1);
    expect(audits?.[0]).toMatchObject({
      operation: "billing_reconciliation_divergence",
      payload: { reason: "PRICE_MISMATCH" },
    });
  });

  it("lets only the service role invoke billing lifecycle RPCs", async () => {
    const projection = await clients.anon.rpc(
      "apply_stripe_projection",
      projectionArgs(await createClub()),
    );
    expectPostgrestError(projection.error, "42501", "anonymous Stripe projection RPC");
    const lifecycle = await clients.anon.rpc("run_billing_lifecycle", {
      p_now: new Date().toISOString(),
      p_suspension_enabled: true,
      p_reconciliation_enabled: true,
    });
    expectPostgrestError(lifecycle.error, "42501", "anonymous lifecycle RPC");
  });

  it("keeps sanitized delivery outcomes append-only and unavailable to clients", async () => {
    const id = `msg_${randomUUID()}`;
    expect(
      (
        await clients.service.from("email_delivery_events").insert({
          id,
          event_type: "email.bounced",
          provider_email_id: `email_${randomUUID()}`,
          occurred_at: new Date().toISOString(),
          payload_digest: "a".repeat(64),
        })
      ).error,
    ).toBeNull();
    const anonymous = await clients.anon.from("email_delivery_events").select("id");
    expectPostgrestError(anonymous.error, "42501", "anonymous delivery ledger read");
    const mutation = await clients.service
      .from("email_delivery_events")
      .update({ event_type: "email.failed" })
      .eq("id", id);
    expectPostgrestError(mutation.error, "42501", "delivery ledger update");
  });
});

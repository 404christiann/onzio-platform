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
    await clients.service
      .from("club_subscriptions")
      .delete()
      .eq("club_id", clubId);
    await clients.service.from("clubs").delete().eq("id", clubId);
  }
});

async function createClub(lifecycle: "onboarding" | "active" = "onboarding") {
  const id = randomUUID();
  clubIds.push(id);
  const { error } = await clients.service.from("clubs").insert({
    id,
    slug: `stripe-${id.slice(0, 8)}`,
    name: "Stripe Contract Club",
    lifecycle,
    public_access: lifecycle === "active" ? "preview" : "preview",
    tier: "starter",
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
    p_price_id: "price_test_pro",
    p_tier: "pro",
    p_status: "active",
    p_cancel_at_period_end: false,
    p_paid_through: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    p_grace_ends_at: null,
    p_public_access: "live",
    p_payload_digest: "b".repeat(64),
    ...overrides,
  };
}

describe("Stripe billing database contract", () => {
  it("atomically applies the ledger, subscription, tier, and runtime state", async () => {
    const clubId = await createClub();
    const args = projectionArgs(clubId);
    const { data, error } = await clients.service.rpc(
      "apply_stripe_projection",
      args,
    );
    expect(error?.message).toBeUndefined();
    expect(data).toMatchObject({ action: "applied", eventId: args.p_event_id });

    const { data: club } = await clients.service
      .from("clubs")
      .select("lifecycle,public_access,tier")
      .eq("id", clubId)
      .single();
    const { data: subscription } = await clients.service
      .from("club_subscriptions")
      .select(
        "stripe_customer_id,stripe_subscription_id,price_id,tier,status,last_applied_stripe_event_id",
      )
      .eq("club_id", clubId)
      .single();
    const { data: event } = await clients.service
      .from("stripe_events")
      .select("outcome,rejection_code")
      .eq("id", args.p_event_id)
      .single();

    expect(club).toEqual({
      lifecycle: "active",
      public_access: "live",
      tier: "pro",
    });
    expect(subscription).toMatchObject({
      stripe_customer_id: args.p_customer_id,
      stripe_subscription_id: args.p_subscription_id,
      price_id: "price_test_pro",
      tier: "pro",
      status: "active",
      last_applied_stripe_event_id: args.p_event_id,
    });
    expect(event).toEqual({ outcome: "applied", rejection_code: null });
  });

  it("rejects duplicate and stale events without changing the projection", async () => {
    const clubId = await createClub();
    const initial = projectionArgs(clubId, {
      p_stripe_created_at: "2026-07-26T12:00:00.000Z",
    });
    const first = await clients.service.rpc("apply_stripe_projection", initial);
    expect(first.error?.message).toBeUndefined();

    const duplicate = await clients.service.rpc(
      "apply_stripe_projection",
      initial,
    );
    expect(duplicate.error?.message).toBeUndefined();
    expect(duplicate.data).toMatchObject({
      action: "rejected",
      code: "DUPLICATE_EVENT",
    });

    const stale = projectionArgs(clubId, {
      p_event_id: `evt_${randomUUID()}`,
      p_stripe_created_at: "2026-07-26T11:59:59.000Z",
      p_customer_id: initial.p_customer_id,
      p_subscription_id: initial.p_subscription_id,
      p_tier: "starter",
      p_price_id: "price_test_starter",
    });
    const staleResult = await clients.service.rpc(
      "apply_stripe_projection",
      stale,
    );
    expect(staleResult.data).toMatchObject({
      action: "rejected",
      code: "STALE_EVENT",
    });

    const { data: subscription } = await clients.service
      .from("club_subscriptions")
      .select("tier,last_applied_stripe_event_id")
      .eq("club_id", clubId)
      .single();
    const { data: staleLedger } = await clients.service
      .from("stripe_events")
      .select("outcome,rejection_code")
      .eq("id", stale.p_event_id)
      .single();
    expect(subscription).toEqual({
      tier: "pro",
      last_applied_stripe_event_id: initial.p_event_id,
    });
    expect(staleLedger).toEqual({
      outcome: "rejected",
      rejection_code: "STALE_EVENT",
    });
  });

  it("rolls back the event ledger when the subscription write fails", async () => {
    const firstClubId = await createClub();
    const secondClubId = await createClub();
    const sharedCustomer = `cus_${randomUUID()}`;
    const first = projectionArgs(firstClubId, {
      p_customer_id: sharedCustomer,
    });
    expect(
      (await clients.service.rpc("apply_stripe_projection", first)).error
        ?.message,
    ).toBeUndefined();

    const conflicting = projectionArgs(secondClubId, {
      p_customer_id: sharedCustomer,
    });
    const result = await clients.service.rpc(
      "apply_stripe_projection",
      conflicting,
    );
    expectPostgrestError(
      result.error,
      "23505",
      "conflicting Stripe customer projection",
    );

    const { data: event } = await clients.service
      .from("stripe_events")
      .select("id")
      .eq("id", conflicting.p_event_id);
    const { data: secondSubscription } = await clients.service
      .from("club_subscriptions")
      .select("club_id")
      .eq("club_id", secondClubId);
    expect(event).toEqual([]);
    expect(secondSubscription).toEqual([]);
  });

  it("expires public grace from timestamps without waiting for another webhook", async () => {
    const clubId = await createClub("active");
    const args = projectionArgs(clubId, {
      p_status: "canceled",
      p_paid_through: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      p_grace_ends_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      p_public_access: "grace",
    });
    expect(
      (await clients.service.rpc("apply_stripe_projection", args)).error
        ?.message,
    ).toBeUndefined();

    const insideGrace = await clients.anon
      .from("clubs")
      .select("id")
      .eq("id", clubId);
    expect(insideGrace.data).toEqual([{ id: clubId }]);

    await clients.service
      .from("club_subscriptions")
      .update({
        grace_ends_at: new Date(Date.now() - 1_000).toISOString(),
      })
      .eq("club_id", clubId);
    const afterGrace = await clients.anon
      .from("clubs")
      .select("id")
      .eq("id", clubId);
    expect(afterGrace.data).toEqual([]);
  });

  it("lets only the service role invoke Stripe projection RPCs", async () => {
    const clubId = await createClub();
    const result = await clients.anon.rpc(
      "apply_stripe_projection",
      projectionArgs(clubId),
    );
    expectPostgrestError(
      result.error,
      "42501",
      "anonymous Stripe projection RPC",
    );
  });

  it("keeps applied Stripe ledger rows immutable outside the private RPC", async () => {
    const clubId = await createClub();
    const args = projectionArgs(clubId);
    expect(
      (await clients.service.rpc("apply_stripe_projection", args)).error
        ?.message,
    ).toBeUndefined();

    const mutation = await clients.service
      .from("stripe_events")
      .update({ outcome: "rejected", rejection_code: "FORGED" })
      .eq("id", args.p_event_id);
    expectPostgrestError(
      mutation.error,
      "42501",
      "direct service-role Stripe ledger update",
    );
  });
});

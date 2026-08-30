import { createHash, randomUUID } from "node:crypto";
import { archiveClub } from "@/lib/operator/archive-club";
import { reactivateClub } from "@/lib/operator/reactivate-club";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_CONFIRMATION = `phase-7-lifecycle:${EXPECTED_PROJECT_REF}`;
const BRAVO_HOSTNAME = "bravo-onzio-staging.vercel.app";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStagingTarget() {
  if (required("ONZIO_PHASE7_CONFIRM") !== EXPECTED_CONFIRMATION) {
    throw new Error(`ONZIO_PHASE7_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }
  if (process.env.ONZIO_ENVIRONMENT !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("Refusing an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern staging Supabase secret key is required");
  }
  required("VERCEL_AUTOMATION_BYPASS_SECRET");
  required("ONZIO_OPERATOR_USER_IDS");
}

function eventId(label: string): string {
  return `evt_phase7_lifecycle_${label}_${randomUUID().replaceAll("-", "")}`;
}

function digest(label: string): string {
  return createHash("sha256").update(`phase7:${label}`).digest("hex");
}

async function hostedStatus(pathname: string): Promise<number> {
  const response = await fetch(`https://${BRAVO_HOSTNAME}${pathname}`, {
    headers: {
      "x-vercel-protection-bypass": required(
        "VERCEL_AUTOMATION_BYPASS_SECRET",
      ),
    },
    redirect: "manual",
  });
  return response.status;
}

async function main() {
  assertStagingTarget();
  const operatorAccessToken = await acquireOperatorAccessToken();
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const { data: clubs, error: clubsError } = await onzio
    .from("clubs")
    .select("id,slug,lifecycle,public_access,tier,archived_at")
    .in("slug", ["alpha", "bravo"]);
  if (clubsError || clubs?.length !== 2) {
    throw clubsError ?? new Error("Expected Alpha and Bravo staging clubs");
  }
  const alpha = clubs.find((club) => club.slug === "alpha");
  const bravo = clubs.find((club) => club.slug === "bravo");
  if (!alpha || !bravo) throw new Error("Synthetic clubs are missing");
  const bravoId = bravo.id;
  if (
    bravo.lifecycle !== "onboarding" ||
    bravo.public_access !== "preview"
  ) {
    throw new Error("Bravo must begin in onboarding/private preview");
  }
  const { data: existingBravoSubscription, error: existingSubscriptionError } =
    await onzio
      .from("club_subscriptions")
      .select("club_id")
      .eq("club_id", bravo.id)
      .maybeSingle();
  if (existingSubscriptionError) throw existingSubscriptionError;
  if (existingBravoSubscription) {
    throw new Error("Bravo must not have an existing subscription");
  }
  const { data: alphaSubscription, error: alphaSubscriptionError } =
    await onzio
      .from("club_subscriptions")
      .select("stripe_customer_id")
      .eq("club_id", alpha.id)
      .single();
  if (alphaSubscriptionError || !alphaSubscription.stripe_customer_id) {
    throw alphaSubscriptionError ?? new Error("Alpha subscription is required");
  }

  const customerId = `cus_phase7_${randomUUID().replaceAll("-", "")}`;
  const subscriptionId = `sub_phase7_${randomUUID().replaceAll("-", "")}`;
  let sequence = 0;
  let bravoSubscriptionCreated = false;
  let rollbackClubId: string | null = null;

  async function project(input: {
    label: string;
    status: string;
    paidThrough: string | null;
    graceEndsAt: string | null;
    publicAccess: "live" | "grace" | "suspended";
    customer?: string;
  }) {
    sequence += 1;
    const id = eventId(input.label);
    const result = await onzio.rpc("apply_stripe_projection", {
      p_event_id: id,
      p_event_type: "customer.subscription.updated",
      p_stripe_created_at: new Date(
        Date.now() + sequence * 1_000,
      ).toISOString(),
      p_environment: "test",
      p_club_id: bravoId,
      p_customer_id: input.customer ?? customerId,
      p_subscription_id: subscriptionId,
      p_price_id: required("STRIPE_PRICE_ID_STARTER"),
      p_tier: "starter",
      p_status: input.status,
      p_cancel_at_period_end: false,
      p_paid_through: input.paidThrough,
      p_grace_ends_at: input.graceEndsAt,
      p_public_access: input.publicAccess,
      p_payload_digest: digest(input.label),
    });
    return { id, result };
  }

  async function runtimeAccess(): Promise<string> {
    const result = await onzio.rpc("get_club_runtime_access", {
      p_club_id: bravoId,
    });
    if (result.error || typeof result.data !== "string") {
      throw result.error ?? new Error("Runtime access was not returned");
    }
    return result.data;
  }

  try {
    const active = await project({
      label: "active",
      status: "active",
      paidThrough: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      graceEndsAt: null,
      publicAccess: "live",
    });
    if (active.result.error || (await runtimeAccess()) !== "live") {
      throw active.result.error ?? new Error("Active projection was not live");
    }
    bravoSubscriptionCreated = true;
    if ((await hostedStatus("/")) !== 200) {
      throw new Error("Active Bravo was not publicly rendered");
    }

    const pastDue = await project({
      label: "past_due",
      status: "past_due",
      paidThrough: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      graceEndsAt: null,
      publicAccess: "live",
    });
    if (pastDue.result.error || (await runtimeAccess()) !== "live") {
      throw pastDue.result.error ?? new Error("Past-due projection was not live");
    }

    const grace = await project({
      label: "grace",
      status: "canceled",
      paidThrough: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      graceEndsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      publicAccess: "grace",
    });
    if (grace.result.error || (await runtimeAccess()) !== "grace") {
      throw grace.result.error ?? new Error("Canceled projection missed grace");
    }
    if ((await hostedStatus("/")) !== 200) {
      throw new Error("Bravo was unavailable during public grace");
    }

    const suspended = await project({
      label: "suspended",
      status: "canceled",
      paidThrough: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      graceEndsAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      publicAccess: "suspended",
    });
    if (suspended.result.error || (await runtimeAccess()) !== "suspended") {
      throw suspended.result.error ?? new Error("Expired grace was not suspended");
    }
    if ((await hostedStatus("/")) !== 404) {
      throw new Error("Suspended Bravo remained publicly available");
    }

    rollbackClubId = randomUUID();
    const rollbackSlug = `phase7-rollback-${rollbackClubId.slice(0, 8)}`;
    const rollbackClub = await onzio.from("clubs").insert({
      id: rollbackClubId,
      slug: rollbackSlug,
      name: "Phase 7 Rollback Fixture",
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
    });
    if (rollbackClub.error) throw rollbackClub.error;
    const rollbackEventId = eventId("rollback_conflict");
    const conflict = await onzio.rpc("apply_stripe_projection", {
      p_event_id: rollbackEventId,
      p_event_type: "customer.subscription.updated",
      p_stripe_created_at: new Date(Date.now() + 30_000).toISOString(),
      p_environment: "test",
      p_club_id: rollbackClubId,
      p_customer_id: alphaSubscription.stripe_customer_id,
      p_subscription_id: `sub_phase7_rollback_${randomUUID().replaceAll("-", "")}`,
      p_price_id: required("STRIPE_PRICE_ID_STARTER"),
      p_tier: "starter",
      p_status: "active",
      p_cancel_at_period_end: false,
      p_paid_through: new Date(
        Date.now() + 30 * 86_400_000,
      ).toISOString(),
      p_grace_ends_at: null,
      p_public_access: "live",
      p_payload_digest: digest("rollback_conflict"),
    });
    if (!conflict.error) {
      throw new Error("Conflicting customer projection did not fail");
    }
    const rollbackSubscription = await onzio
      .from("club_subscriptions")
      .select("club_id")
      .eq("club_id", rollbackClubId);
    const rollbackLedger = await onzio
      .from("stripe_events")
      .select("id")
      .eq("id", rollbackEventId);
    if (
      rollbackSubscription.error ||
      rollbackSubscription.data.length !== 0 ||
      rollbackLedger.error ||
      rollbackLedger.data.length !== 0
    ) {
      throw new Error("Failed projection left partial state");
    }
    const rollbackDelete = await onzio
      .from("clubs")
      .delete()
      .eq("id", rollbackClubId);
    if (rollbackDelete.error) throw rollbackDelete.error;
    rollbackClubId = null;

    const archived = await archiveClub({
      clubId: bravo.id,
      operatorAccessToken,
      reason: "Phase 7 hosted lifecycle acceptance",
    });
    if (
      !archived.domainsDetached ||
      (await hostedStatus("/")) !== 404 ||
      (await hostedStatus("/admin/login")) !== 404
    ) {
      throw new Error("Archived Bravo retained routing");
    }

    const reactivated = await reactivateClub({
      clubId: bravo.id,
      operatorAccessToken,
    });
    if (
      reactivated.lifecycle !== "onboarding" ||
      reactivated.publicAccess !== "preview" ||
      (await runtimeAccess()) !== "preview" ||
      (await hostedStatus("/")) !== 404 ||
      (await hostedStatus("/admin/login")) !== 200
    ) {
      throw new Error("Reactivated Bravo did not return to private preview");
    }

    console.log(
      JSON.stringify({
        event: "phase7.hosted_lifecycle_verified",
        projectRef: EXPECTED_PROJECT_REF,
        pastDueRemainedLive: true,
        gracePublic: true,
        expiredGraceSuspended: true,
        rollbackAtomic: true,
        archiveDetachedRouting: true,
        reactivationReturnedToPreview: true,
      }),
    );
  } finally {
    if (rollbackClubId) {
      await onzio.from("clubs").delete().eq("id", rollbackClubId);
    }
    if (bravoSubscriptionCreated) {
      await onzio
        .from("club_subscriptions")
        .delete()
        .eq("club_id", bravo.id);
    }
    const { data: currentBravo } = await onzio
      .from("clubs")
      .select("lifecycle")
      .eq("id", bravo.id)
      .single();
    if (currentBravo?.lifecycle === "archived") {
      await reactivateClub({ clubId: bravo.id, operatorAccessToken });
    }
    await onzio
      .from("clubs")
      .update({
        lifecycle: "onboarding",
        public_access: "preview",
        tier: "starter",
        archived_at: null,
      })
      .eq("id", bravo.id);
    await onzio
      .from("club_domains")
      .update({ active: true })
      .eq("club_id", bravo.id)
      .eq("is_primary", true)
      .not("verified_at", "is", null);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

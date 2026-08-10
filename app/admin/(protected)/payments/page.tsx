import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PaymentStatusCard } from "@/components/admin/payments/PaymentStatusCard";
import { getClubContext } from "@/lib/club-context";
import { getConfiguredStripePriceLabel } from "@/lib/stripe-price";
import { createClient } from "@/lib/supabase-server";
import {
  resolvePaymentsUiState,
  type SubscriptionMirrorRow,
} from "@/lib/stripe-subscription-state";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId: user.id,
  });
  if (club.role !== "owner" || club.lifecycle === "archived") {
    redirect("/admin/login?error=owner_required");
  }

  const { data: subscription } = await supabase
    .schema("onzio")
    .from("club_subscriptions")
    .select(
      "stripe_customer_id,stripe_subscription_id,status,cancel_at_period_end,paid_through,grace_ends_at",
    )
    .eq("club_id", club.id)
    .maybeSingle();
  const mirrorRow: SubscriptionMirrorRow = subscription
    ? {
        stripe_customer_id: subscription.stripe_customer_id,
        stripe_subscription_id: subscription.stripe_subscription_id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: subscription.paid_through,
        grace_ends_at: subscription.grace_ends_at,
      }
    : null;
  const uiState = resolvePaymentsUiState(mirrorRow);
  const priceLabel = await getConfiguredStripePriceLabel();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase leading-none text-white"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Payments
        </h1>
        <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-white/40">
          {club.name} subscription and billing.
        </p>
      </div>

      <PaymentStatusCard
        uiState={uiState}
        priceLabel={priceLabel}
        clubName={club.name}
        clubKind={club.kind}
      />
    </div>
  );
}

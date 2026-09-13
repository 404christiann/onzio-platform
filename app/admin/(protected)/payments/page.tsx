import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentStatusCard } from "@/components/admin/payments/PaymentStatusCard";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { getClubContext } from "@/lib/club-context";
import { getConfiguredStripePriceLabel } from "@/lib/stripe-price";
import { createClient } from "@/lib/supabase-server";
import {
  resolvePaymentsUiState,
  type SubscriptionMirrorRow,
} from "@/lib/stripe-subscription-state";

export default function PaymentsPage() {
  return (
    <Suspense fallback={<PaymentsSkeleton />}>
      <PaymentsPageContent />
    </Suspense>
  );
}

function PaymentsSkeleton() {
  return (
    <AdminPage className="max-w-4xl">
      <AdminPageHeader title="Payments" description="Subscription and billing." />
      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-7">
        <AdminSkeletonRegion label="Loading subscription details" className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-12 w-48 max-w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <div className="border-t border-border pt-5">
            <Skeleton className="h-10 w-full rounded-lg sm:w-44" />
          </div>
        </AdminSkeletonRegion>
      </section>
    </AdminPage>
  );
}

async function PaymentsPageContent() {
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
  const priceLabel = await getConfiguredStripePriceLabel(club.stripePriceId);

  return (
    <AdminPage className="max-w-4xl">
      <AdminPageHeader
        title="Payments"
        description={`${club.name} subscription and billing.`}
      />

      <PaymentStatusCard
        uiState={uiState}
        priceLabel={priceLabel}
        clubName={club.name}
        clubKind={club.kind}
      />
    </AdminPage>
  );
}

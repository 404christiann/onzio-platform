import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import {
  resolvePaymentsUiState,
  type SubscriptionMirrorRow,
} from "@/lib/stripe-subscription-state";

const SUPPORT_EMAIL = "onziofutbol@gmail.com";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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

  const statusLabel =
    uiState.state === "no_subscription"
      ? "Private preview"
      : uiState.state === "active"
        ? "Subscription active"
        : uiState.state === "active_canceling"
          ? `Ends ${formatDate(uiState.periodEndsAt)}`
          : uiState.state === "grace"
            ? `Payment overdue — ${uiState.daysRemaining} days remaining`
          : "Subscription ended";

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

      <section className="rounded-xl border border-white/10 bg-[#141414] p-5 sm:p-7">
        <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-[#E7001B]">
          Subscription Status
        </p>
        <h2 className="mt-2 font-display text-2xl font-black uppercase text-white">
          {statusLabel}
        </h2>

        {uiState.state === "active_canceling" && (
          <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 font-body text-sm text-white/60">
            Your subscription is scheduled to end on{" "}
            {formatDate(uiState.periodEndsAt)}. Contact Onzio if this should be
            changed; Portal cancellation is disabled.
          </p>
        )}

        {uiState.state === "terminal" && (
          <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 font-body text-sm text-red-300">
            Content administration is on hold. Use the Customer Portal to
            restore billing, or contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        )}

        {uiState.state === "grace" && (
          <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 font-body text-sm text-amber-100">
            Content editing remains available while payment is overdue. Your
            public site stays live until the grace period ends on{" "}
            {formatDate(uiState.graceEndsAt)}. Update the card in the Customer
            Portal or contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        )}

        {uiState.state === "no_subscription" && club.kind !== "customer" ? (
          <p className="mt-5 rounded-lg border border-white/10 bg-black/20 px-4 py-3 font-body text-sm text-white/60">
            This {club.kind} club does not require a paid subscription.
          </p>
        ) : uiState.state === "no_subscription" ? (
          <form action="/api/stripe/checkout" method="POST" className="mt-6">
            <button
              type="submit"
              className="w-full rounded-lg bg-[#E7001B] px-6 py-4 font-display text-lg font-black uppercase tracking-widest text-white transition hover:bg-[#ff0a25] sm:w-auto"
            >
              Start subscription
            </button>
          </form>
        ) : (
          <form action="/api/stripe/portal" method="POST" className="mt-6">
            <button
              type="submit"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-6 py-4 font-display text-lg font-black uppercase tracking-widest text-white/80 transition hover:border-white/20 hover:text-white sm:w-auto"
            >
              Manage Billing
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

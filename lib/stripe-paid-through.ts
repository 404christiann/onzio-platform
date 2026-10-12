import type Stripe from "stripe";
import { ContractError } from "@/lib/contract-error";

function id(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  return id(invoice.parent?.subscription_details?.subscription) ?? id(legacy.subscription);
}

function paidLineEnd(line: Stripe.InvoiceLineItem, subscriptionId: string): number | null {
  const details = line.parent?.subscription_item_details;
  const legacy = line as Stripe.InvoiceLineItem & { type?: string; proration?: boolean };
  const belongsToSubscription = details
    ? details.subscription === subscriptionId && details.proration === false
    : legacy.type === "subscription" && legacy.proration === false && id(line.subscription) === subscriptionId;
  const end = line.period?.end;
  return belongsToSubscription && line.amount >= 0 && Number.isSafeInteger(end) && end > 0
    ? end
    : null;
}

/** Rebuild coverage from paid recurring invoices, including history when the
 * latest invoice failed. Never reuse a possibly inflated local paid-through.
 * Prorations and one-off invoice items cannot purchase a new recurring period.
 */
export async function getStripePaidThrough(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  let paidThroughEnd: number | null = null;
  for await (const invoice of stripe.invoices.list({
    subscription: subscription.id,
    status: "paid",
    limit: 100,
  })) {
    if (invoice.status !== "paid" || invoice.livemode !== subscription.livemode ||
        id(invoice.customer) !== id(subscription.customer) ||
        invoiceSubscriptionId(invoice) !== subscription.id) {
      throw new ContractError("PAID_INVOICE_MISMATCH");
    }
    const lines = invoice.lines.has_more
      ? stripe.invoices.listLineItems(invoice.id, { limit: 100 })
      : invoice.lines.data;
    for await (const line of lines) {
      const end = paidLineEnd(line, subscription.id);
      if (end !== null) paidThroughEnd = Math.max(paidThroughEnd ?? 0, end);
    }
  }
  // Creation order is not coverage order: a newly issued invoice can cover
  // an older period. Never shorten coverage already purchased by another one.
  return paidThroughEnd === null ? null : new Date(paidThroughEnd * 1000).toISOString();
}

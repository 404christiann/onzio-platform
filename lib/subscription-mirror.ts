import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionMirrorRow } from "@/lib/stripe-subscription-state";

export async function getSubscriptionMirrorRow(
  supabase: SupabaseClient,
): Promise<SubscriptionMirrorRow> {
  const { data } = await supabase
    .from("stripe_subscription")
    .select("stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end")
    .eq("id", 1)
    .maybeSingle();

  return data as SubscriptionMirrorRow;
}

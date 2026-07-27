import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionMirrorRow } from "@/lib/subscription-mirror";

function fakeSupabaseClient(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockReturnValue({ maybeSingle: () => Promise.resolve(result) });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, _select: select, _eq: eq } as unknown as SupabaseClient & {
    _select: typeof select;
    _eq: typeof eq;
  };
}

describe("getSubscriptionMirrorRow", () => {
  it("returns the row when one exists", async () => {
    const row = {
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: "2026-08-01T00:00:00.000Z",
    };
    const client = fakeSupabaseClient({ data: row, error: null });

    const result = await getSubscriptionMirrorRow(client);

    expect(result).toEqual(row);
    expect(client.from).toHaveBeenCalledWith("stripe_subscription");
    expect(client._eq).toHaveBeenCalledWith("id", 1);
  });

  it("returns null when no row exists yet", async () => {
    const client = fakeSupabaseClient({ data: null, error: null });

    const result = await getSubscriptionMirrorRow(client);

    expect(result).toBeNull();
  });
});

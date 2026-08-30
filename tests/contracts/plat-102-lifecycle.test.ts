import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";

type PlanLifecycle = (
  input: Array<Record<string, unknown>>,
  options: Record<string, unknown>,
) => Record<string, unknown>;

const customer = {
  clubId: "11111111-1111-4111-8111-111111111111",
  kind: "customer",
  publicAccess: "grace",
  intendedPriceId: "price_contract",
  actualPriceId: "price_contract",
  status: "past_due",
  paidThrough: "2026-08-01T00:00:00.000Z",
  graceEndsAt: "2026-08-21T00:00:00.000Z",
  recordedOperations: [],
};

describe("PLAT-102 lifecycle planning", () => {
  it("warns on grace days 7 and 17 exactly once", async () => {
    const plan = await loadContract<PlanLifecycle>(
      "@/lib/billing-lifecycle",
      "planBillingLifecycle",
    );
    expect(
      plan([customer], {
        now: new Date("2026-08-08T00:00:00.000Z"),
        suspensionEnabled: true,
        reconciliationEnabled: true,
      }),
    ).toMatchObject({ warnings: [{ day: 7 }] });
    expect(
      plan(
        [{ ...customer, recordedOperations: ["billing_grace_warning_day_7"] }],
        {
          now: new Date("2026-08-18T00:00:00.000Z"),
          suspensionEnabled: true,
          reconciliationEnabled: true,
        },
      ),
    ).toMatchObject({ warnings: [{ day: 17 }] });
  });

  it("keeps suspension kill-switched while warnings and reconciliation remain independent", async () => {
    const plan = await loadContract<PlanLifecycle>(
      "@/lib/billing-lifecycle",
      "planBillingLifecycle",
    );
    const result = plan(
      [
        {
          ...customer,
          actualPriceId: "price_drifted",
          graceEndsAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      {
        now: new Date("2026-08-22T00:00:00.000Z"),
        suspensionEnabled: false,
        reconciliationEnabled: true,
      },
    );
    expect(result).toMatchObject({
      suspensions: [],
      divergences: [{ reason: "PRICE_MISMATCH" }],
    });
  });

  it("ignores demo and test clubs entirely", async () => {
    const plan = await loadContract<PlanLifecycle>(
      "@/lib/billing-lifecycle",
      "planBillingLifecycle",
    );
    const result = plan(
      [
        { ...customer, kind: "demo" },
        { ...customer, clubId: "22222222-2222-4222-8222-222222222222", kind: "test" },
      ],
      {
        now: new Date("2026-09-01T00:00:00.000Z"),
        suspensionEnabled: true,
        reconciliationEnabled: true,
      },
    );
    expect(result).toMatchObject({
      warnings: [],
      suspensions: [],
      divergences: [],
    });
  });
});

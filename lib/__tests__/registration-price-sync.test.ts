import { describe, expect, it } from "vitest";
import { planRegistrationPricePositionSync } from "@/lib/registration-price-sync";

describe("registration price position sync", () => {
  it("stages all persisted rows and retains removed prices as distinct inactive history", () => {
    const plan = planRegistrationPricePositionSync(["price-a", "price-b", "price-c"], new Set(["price-b"]));
    expect(plan.stage).toEqual([
      { id: "price-a", position: 1_000_000 }, { id: "price-b", position: 1_000_001 }, { id: "price-c", position: 1_000_002 },
    ]);
    expect(plan.deactivate).toEqual([
      { id: "price-a", position: 1_100_000 }, { id: "price-c", position: 1_100_001 },
    ]);
  });
});

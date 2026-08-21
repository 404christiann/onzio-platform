import { describe, expect, it } from "vitest";
import {
  formatRegistrationPrice,
  toPublicRegistrationForm,
} from "@/lib/registration-public";

describe("public registration form projection", () => {
  it("removes tenant and Stripe configuration details", () => {
    const form = toPublicRegistrationForm({
      form: {
        id: "11111111-1111-4111-8111-111111111111",
        club_id: "22222222-2222-4222-8222-222222222222",
        slug: "fall-camp",
        title: "Fall Camp",
        description: "A focused fall camp.",
        participant_mode: "both",
        waiver_text: "I accept the waiver.",
      },
      fields: [{
        id: "33333333-3333-4333-8333-333333333333",
        field_key: "player_name",
        label: "Player name",
        field_type: "name",
        options: null,
        required: true,
        is_core: true,
        participant_scope: "minor",
        position: 0,
      }],
      prices: [{
        id: "44444444-4444-4444-8444-444444444444",
        label: "Player",
        amount_cents: 12500,
        position: 0,
      }],
      connect: {
        club_id: "22222222-2222-4222-8222-222222222222",
        stripe_account_id: "acct_private",
        environment: "test",
        charges_enabled: true,
        details_submitted: true,
        payouts_enabled: true,
      },
    });
    expect(form).toEqual({
      slug: "fall-camp",
      title: "Fall Camp",
      description: "A focused fall camp.",
      participantMode: "both",
      waiverText: "I accept the waiver.",
      fields: [{ key: "player_name", label: "Player name", type: "name", required: true, options: undefined, isCore: true, participantScope: "minor" }],
      prices: [{ id: "44444444-4444-4444-8444-444444444444", label: "Player", amountCents: 12500 }],
    });
    expect(JSON.stringify(form)).not.toContain("acct_private");
    expect(JSON.stringify(form)).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it("formats cents as USD for the public price picker", () => {
    expect(formatRegistrationPrice(0)).toBe("$0.00");
    expect(formatRegistrationPrice(12500)).toBe("$125.00");
  });
});

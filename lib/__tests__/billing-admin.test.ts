import { describe, expect, it } from "vitest";
import {
  getBillingAdminEmails,
  isBillingAdminEmail,
} from "@/lib/billing-admin";

describe("getBillingAdminEmails", () => {
  it("supports the legacy single-email env var", () => {
    expect(
      getBillingAdminEmails({
        BILLING_ADMIN_EMAIL: "christian@example.com",
      }),
    ).toEqual(["christian@example.com"]);
  });

  it("supports a comma-separated billing admin list", () => {
    expect(
      getBillingAdminEmails({
        BILLING_ADMIN_EMAILS: "christian@example.com, info@example.com",
      }),
    ).toEqual(["christian@example.com", "info@example.com"]);
  });

  it("deduplicates and normalizes addresses from both env vars", () => {
    expect(
      getBillingAdminEmails({
        BILLING_ADMIN_EMAIL: "Christian@Example.com",
        BILLING_ADMIN_EMAILS: "christian@example.com, info@example.com",
      }),
    ).toEqual(["christian@example.com", "info@example.com"]);
  });
});

describe("isBillingAdminEmail", () => {
  it("allows either configured billing admin", () => {
    const env = {
      BILLING_ADMIN_EMAILS: "christian@example.com, info@example.com",
    };

    expect(isBillingAdminEmail("christian@example.com", env)).toBe(true);
    expect(isBillingAdminEmail("info@example.com", env)).toBe(true);
  });

  it("rejects missing or unconfigured emails", () => {
    const env = {
      BILLING_ADMIN_EMAILS: "christian@example.com, info@example.com",
    };

    expect(isBillingAdminEmail(null, env)).toBe(false);
    expect(isBillingAdminEmail("other@example.com", env)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  createAuthEmailCallbackUrl,
  parseEmailOtpType,
  resolveAuthCallbackDestination,
} from "@/lib/auth-email-callback";

describe("authentication email callback", () => {
  it.each(["email", "invite", "magiclink", "recovery"] as const)(
    "accepts the supported %s token-hash type",
    (type) => {
      expect(parseEmailOtpType(type)).toBe(type);
    },
  );

  it.each([
    null,
    "",
    "signup",
    "email_change",
    "admin",
    "https://evil.example",
  ])("rejects unsupported or forged token-hash type %#", (type) => {
    expect(parseEmailOtpType(type)).toBeNull();
  });

  it.each(["invite", "recovery"] as const)(
    "routes %s verification to password setup",
    (type) => {
      expect(
        resolveAuthCallbackDestination({
          type,
          requestedNext: "https://evil.example",
        }),
      ).toBe("/admin/update-password");
    },
  );

  it("allowlists the legacy PKCE password-update destination", () => {
    expect(
      resolveAuthCallbackDestination({
        type: null,
        requestedNext: "/admin/update-password",
      }),
    ).toBe("/admin/update-password");
    expect(
      resolveAuthCallbackDestination({
        type: null,
        requestedNext: "https://evil.example",
      }),
    ).toBe("/admin");
  });

  it("creates a callback without bearer credentials or caller query data", () => {
    expect(createAuthEmailCallbackUrl("https://alpha.example")).toBe(
      "https://alpha.example/admin/auth/callback",
    );
  });
});

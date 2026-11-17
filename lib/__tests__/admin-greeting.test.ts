import { describe, expect, it } from "vitest";
import { adminGreeting, memberLabel } from "../admin-greeting";

describe("adminGreeting", () => {
  it("uses the first name when a name is saved", () => {
    expect(adminGreeting("Marco")).toBe("Hi Marco");
    expect(adminGreeting("  Andrea   Ruiz ")).toBe("Hi Andrea");
    expect(adminGreeting("José-Luis García")).toBe("Hi José-Luis");
  });

  it("falls back to Welcome back when there is no name", () => {
    expect(adminGreeting(null)).toBe("Welcome back");
    expect(adminGreeting(undefined)).toBe("Welcome back");
    expect(adminGreeting("")).toBe("Welcome back");
    expect(adminGreeting("   ")).toBe("Welcome back");
  });
});

describe("memberLabel", () => {
  it("shows the saved name, otherwise the sign-in email", () => {
    expect(memberLabel("Andrea Ruiz", "andrea@club.org")).toBe("Andrea Ruiz");
    expect(memberLabel(null, "andrea@club.org")).toBe("andrea@club.org");
    expect(memberLabel("  ", "andrea@club.org")).toBe("andrea@club.org");
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_REGISTRATION_AMOUNT_CENTS,
  formatRegistrationUsd,
  formatRegistrationUsdInput,
  parseRegistrationUsdInput,
} from "@/lib/registration-currency";

describe("registration currency", () => {
  it.each([
    ["130", 13_000],
    ["130.00", 13_000],
    ["130.5", 13_050],
    ["130.999", 13_100],
    ["0.004", 0],
    ["0.005", 1],
    ["999999.995", MAX_REGISTRATION_AMOUNT_CENTS],
  ])("parses and deterministically rounds %s", (input, amountCents) => {
    expect(parseRegistrationUsdInput(input)).toEqual({
      kind: "valid",
      amountCents,
    });
  });

  it("distinguishes empty from malformed input", () => {
    expect(parseRegistrationUsdInput("")).toEqual({ kind: "empty" });
    expect(parseRegistrationUsdInput("   ")).toEqual({ kind: "empty" });

    for (const value of ["money", "$130", "130,00", "-130", "1e2"]) {
      expect(parseRegistrationUsdInput(value)).toEqual({ kind: "invalid" });
    }
  });

  it("rejects values above the database maximum after rounding", () => {
    expect(parseRegistrationUsdInput("1000000")).toEqual({
      kind: "valid",
      amountCents: MAX_REGISTRATION_AMOUNT_CENTS,
    });
    expect(parseRegistrationUsdInput("1000000.005")).toEqual({
      kind: "out_of_range",
    });
    expect(parseRegistrationUsdInput("1000001")).toEqual({
      kind: "out_of_range",
    });
  });

  it("formats persisted cents consistently for inputs and display", () => {
    expect(formatRegistrationUsdInput(13_050)).toBe("130.50");
    expect(formatRegistrationUsd(0)).toBe("$0.00");
    expect(formatRegistrationUsd(13_000)).toBe("$130.00");
    expect(formatRegistrationUsd(MAX_REGISTRATION_AMOUNT_CENTS)).toBe(
      "$1,000,000.00",
    );
  });
});

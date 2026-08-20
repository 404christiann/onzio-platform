import { describe, expect, it } from "vitest";
import { ContractError } from "@/lib/contract-error";
import {
  generateRegistrationStatusToken,
  hashRegistrationStatusToken,
  matchesRegistrationStatusToken,
  validateRegistrationStatusToken,
} from "@/lib/registration-status-token";

describe("registration status tokens", () => {
  it("generates opaque URL-safe 256-bit tokens", () => {
    const token = generateRegistrationStatusToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateRegistrationStatusToken()).not.toBe(token);
  });

  it("hashes a validated token with SHA-256", () => {
    const token = generateRegistrationStatusToken();
    const hash = hashRegistrationStatusToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(matchesRegistrationStatusToken(token, hash)).toBe(true);
  });

  it("rejects malformed tokens and fails closed for malformed hashes", () => {
    expect(() => validateRegistrationStatusToken("not a token")).toThrow(ContractError);
    expect(() => hashRegistrationStatusToken("short")).toThrow(ContractError);
    expect(matchesRegistrationStatusToken(generateRegistrationStatusToken(), "not-a-hash")).toBe(false);
  });

  it("does not match an altered token or a hash for another token", () => {
    const token = generateRegistrationStatusToken();
    const other = generateRegistrationStatusToken();
    const altered = `${token.slice(0, -1)}${token.endsWith("_") ? "-" : "_"}`;
    expect(matchesRegistrationStatusToken(other, hashRegistrationStatusToken(token))).toBe(false);
    expect(matchesRegistrationStatusToken(altered, hashRegistrationStatusToken(token))).toBe(false);
  });
});

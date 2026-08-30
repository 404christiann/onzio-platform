import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { failContract } from "@/lib/contract-error";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function validToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** Creates an opaque 256-bit URL-safe token. Persist only its SHA-256 hash. */
export function generateRegistrationStatusToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function validateRegistrationStatusToken(token: unknown): string {
  if (!validToken(token)) {
    failContract(
      "REGISTRATION_STATUS_TOKEN_INVALID",
      "Registration status token must be a URL-safe 256-bit token.",
    );
  }
  return token;
}

export function hashRegistrationStatusToken(token: unknown): string {
  return createHash("sha256")
    .update(validateRegistrationStatusToken(token), "utf8")
    .digest("hex");
}

/**
 * Compares a presented opaque token with its stored SHA-256 hash without
 * leaking a matching prefix through a timing side channel.
 */
export function matchesRegistrationStatusToken(
  token: unknown,
  storedHash: unknown,
): boolean {
  if (!validToken(token) || typeof storedHash !== "string" || !HASH_PATTERN.test(storedHash)) {
    return false;
  }
  const candidate = createHash("sha256").update(token, "utf8").digest();
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(candidate, stored);
}

export const createRegistrationStatusToken = generateRegistrationStatusToken;
export const verifyRegistrationStatusToken = matchesRegistrationStatusToken;

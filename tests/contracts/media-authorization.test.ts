import { afterEach, describe, expect, it } from "vitest";
import { ContractError } from "@/lib/contract-error";
import {
  createMediaAuthorizationToken,
  verifyMediaAuthorizationToken,
  type MediaAuthorization,
} from "@/lib/media-processing";

const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
});

function authorization(
  override: Partial<MediaAuthorization> = {},
): MediaAuthorization {
  return {
    version: 1,
    uploadId: "44444444-4444-4444-8444-444444444444",
    clubId: "11111111-1111-4111-8111-111111111111",
    actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    surface: "homepage",
    kind: "photo",
    fileName: "match-day.jpg",
    mimeType: "image/jpeg",
    claimedSize: 1024,
    stagingPath:
      "11111111-1111-4111-8111-111111111111/homepage/44444444-4444-4444-8444-444444444444.jpg",
    expiresAt: Date.now() + 60_000,
    ...override,
  };
}

describe("media upload authorization", () => {
  it("round-trips a signed, short-lived tenant authorization", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "s".repeat(48);
    const input = authorization();
    expect(
      verifyMediaAuthorizationToken(createMediaAuthorizationToken(input)),
    ).toEqual(input);
  });

  it("rejects tampering", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "s".repeat(48);
    const token = createMediaAuthorizationToken(authorization());
    const [payload, signature] = token.split(".");
    expect(() =>
      verifyMediaAuthorizationToken(`${payload}x.${signature}`),
    ).toThrowError(
      expect.objectContaining<Partial<ContractError>>({
        code: "INVALID_UPLOAD_AUTHORIZATION",
      }),
    );
  });

  it("rejects expired authorizations", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "s".repeat(48);
    const token = createMediaAuthorizationToken(
      authorization({ expiresAt: Date.now() - 1 }),
    );
    expect(() => verifyMediaAuthorizationToken(token)).toThrowError(
      expect.objectContaining<Partial<ContractError>>({
        code: "UPLOAD_AUTHORIZATION_EXPIRED",
      }),
    );
  });
});

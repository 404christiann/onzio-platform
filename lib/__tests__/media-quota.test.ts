import { describe, expect, it } from "vitest";
import { ContractError } from "@/lib/contract-error";
import { describeMediaQuotaFailure, MediaRateLimitedError } from "@/lib/media-quota";

describe("describeMediaQuotaFailure", () => {
  it("answers a full club with 409 and a plain message", () => {
    expect(describeMediaQuotaFailure(new ContractError("MEDIA_QUOTA_BYTES_EXCEEDED"))).toEqual({
      code: "MEDIA_QUOTA_BYTES_EXCEEDED",
      status: 409,
      message:
        "Your club has used all of its media storage. Remove images you no longer use, or ask Onzio for more space.",
    });
    expect(describeMediaQuotaFailure(new ContractError("MEDIA_QUOTA_FILES_EXCEEDED"))?.status).toBe(409);
  });

  it("answers a rate refusal with 429 and when to try again", () => {
    expect(describeMediaQuotaFailure(new MediaRateLimitedError(30))).toEqual({
      code: "MEDIA_RATE_LIMITED",
      status: 429,
      message: "Too many uploads in a short time. Try again in a minute.",
      retryAfterSeconds: 30,
    });
    expect(describeMediaQuotaFailure(new MediaRateLimitedError(1500))?.message).toBe(
      "Too many uploads in a short time. Try again in about 25 minutes.",
    );
    expect(describeMediaQuotaFailure(new MediaRateLimitedError(80_000))?.message).toBe(
      "Too many uploads in a short time. Try again in about 23 hours.",
    );
  });

  it("stops the upload with 503 when the check could not run", () => {
    expect(describeMediaQuotaFailure(new ContractError("MEDIA_QUOTA_UNAVAILABLE", "connection refused"))).toMatchObject({
      code: "MEDIA_QUOTA_UNAVAILABLE",
      status: 503,
    });
  });

  it("leaves other errors to the route's existing handling", () => {
    expect(describeMediaQuotaFailure(new ContractError("FILE_TOO_LARGE"))).toBeNull();
    expect(describeMediaQuotaFailure(new Error("MEDIA_QUOTA_BYTES_EXCEEDED"))).toBeNull();
  });
});

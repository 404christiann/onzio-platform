import { describe, expect, it } from "vitest";
import {
  describeMediaAuthorizationFailure,
  MEDIA_AUTH_FAILED,
  MEDIA_STORAGE_UNAVAILABLE,
  MEDIA_UPLOAD_NOT_PERMITTED,
} from "@/lib/media-diagnostics";

// /api/admin/media/authorize used to answer every non-contract failure with a
// bare {"error":{"code":"MEDIA_AUTH_FAILED"}} and no message. That one code
// covers an expired session, a lost membership, a club whose lifecycle blocks
// content edits, a storage RLS denial, and an unreachable Storage service — so
// two separate incidents had to be diagnosed by reading migrations instead of
// by reading the response. These pin the specific classification.
describe("describeMediaAuthorizationFailure", () => {
  it("names a row-level-security denial as a permission problem, not a mystery", () => {
    const result = describeMediaAuthorizationFailure(
      new Error("new row violates row-level security policy"),
    );
    expect(result.code).toBe(MEDIA_UPLOAD_NOT_PERMITTED);
    expect(result.reason).toMatch(/30-day/);
    expect(result.reason).toMatch(/active member/);
    expect(result.reason).toMatch(/lifecycle/);
  });

  it("accepts the Storage client's plain-object error shape", () => {
    const result = describeMediaAuthorizationFailure({
      message: "new row violates row-level security policy for table objects",
      statusCode: "403",
    });
    expect(result.code).toBe(MEDIA_UPLOAD_NOT_PERMITTED);
  });

  it.each([
    "jwt expired",
    "Invalid token",
    "Unauthorized",
  ])("routes %s to a re-authentication instruction", (message) => {
    const result = describeMediaAuthorizationFailure(new Error(message));
    expect(result.code).toBe("AUTHENTICATION_REQUIRED");
    expect(result.reason).toMatch(/sign back in/i);
  });

  it.each(["fetch failed", "ETIMEDOUT", "socket hang up", "network error"])(
    "routes %s to a transient storage-availability answer",
    (message) => {
      const result = describeMediaAuthorizationFailure(new Error(message));
      expect(result.code).toBe(MEDIA_STORAGE_UNAVAILABLE);
    },
  );

  it("keeps an unrecognized message rather than discarding it", () => {
    const result = describeMediaAuthorizationFailure(
      new Error("Bucket not found"),
    );
    expect(result.code).toBe(MEDIA_AUTH_FAILED);
    expect(result.reason).toContain("Bucket not found");
  });

  it("still answers when there is no message at all", () => {
    const result = describeMediaAuthorizationFailure(undefined);
    expect(result.code).toBe(MEDIA_AUTH_FAILED);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("never returns an empty reason, which is what the UI used to render", () => {
    for (const error of [
      new Error("new row violates row-level security policy"),
      new Error("jwt expired"),
      new Error("fetch failed"),
      new Error(""),
      null,
      "plain string failure",
    ]) {
      const { code, reason } = describeMediaAuthorizationFailure(error);
      expect(code.length).toBeGreaterThan(0);
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const publish = vi.hoisted(() => vi.fn());

vi.mock("@/lib/media-authorization-token", () => ({
  verifyMediaAuthorizationToken: () => ({ surface: "about", clubId: "club-1", actorId: "user-1" }),
}));
vi.mock("@/lib/media-route-auth", () => ({
  requireMediaRouteAuthorization: async () => ({ user: { id: "user-1" }, club: { id: "club-1" } }),
}));
vi.mock("@/lib/media-processing", () => ({ publishAuthorizedMedia: publish }));

async function finalize() {
  const { POST } = await import("@/app/api/admin/media/finalize/route");
  const response = await POST(
    new Request("http://localhost/api/admin/media/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorization: "signed-token-".padEnd(64, "x") }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

afterEach(() => {
  publish.mockReset();
  vi.restoreAllMocks();
});

describe("media finalize error messages", () => {
  it.each([
    ["FILE_TOO_LARGE", /too large/i],
    ["DIMENSIONS_TOO_LARGE", /too many pixels/i],
    ["CORRUPT_IMAGE", /could not be read/i],
    ["UNSUPPORTED_MEDIA_TYPE", /file type/i],
    ["SIGNATURE_MISMATCH", /file type/i],
  ])("explains %s in plain words", async (code, message) => {
    publish.mockRejectedValueOnce(new ContractError(code));
    const { status, body } = await finalize();
    expect(status).toBe(400);
    expect(body.error.code).toBe(code);
    expect(body.error.message).toMatch(message);
  });

  it("logs an unexpected failure and still returns a message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Unable to publish normalized media: storage down");
    publish.mockRejectedValueOnce(failure);
    const { status, body } = await finalize();
    expect(status).toBe(500);
    expect(body.error).toEqual({
      code: "MEDIA_FINALIZATION_FAILED",
      message: "The image could not be uploaded. Try again.",
    });
    expect(logged).toHaveBeenCalledWith("[media finalize] unexpected failure", failure);
  });

  it("does not log a known refusal", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    publish.mockRejectedValueOnce(new ContractError("DIMENSIONS_TOO_LARGE"));
    await finalize();
    expect(logged).not.toHaveBeenCalled();
  });
});

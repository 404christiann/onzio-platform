import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  readRegistrationStatus: vi.fn(),
}));

vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/registration-service", () => ({
  readRegistrationStatus: mocks.readRegistrationStatus,
}));

import { GET } from "@/app/api/register/status/route";
import {
  generateRegistrationStatusToken,
  hashRegistrationStatusToken,
} from "@/lib/registration-status-token";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClubContext.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    lifecycle: "active",
    publicAccess: "live",
  });
});

describe("registration status polling", () => {
  it("returns only coarse status with no-store caching", async () => {
    const token = generateRegistrationStatusToken();
    mocks.readRegistrationStatus.mockResolvedValue("paid");
    const response = await GET(new Request(
      `http://alpha.localhost/api/register/status?token=${token}`,
      { headers: { host: "alpha.localhost" } },
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ status: "paid" });
    expect(mocks.readRegistrationStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      hashRegistrationStatusToken(token),
    );
  });

  it("fails closed for malformed tokens without returning PII", async () => {
    const response = await GET(new Request(
      "http://alpha.localhost/api/register/status?token=bad",
      { headers: { host: "alpha.localhost" } },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "REGISTRATION_STATUS_TOKEN_INVALID",
    });
    expect(mocks.readRegistrationStatus).not.toHaveBeenCalled();
  });
});

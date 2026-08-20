import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  schema: vi.fn(),
}));

vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({ schema: mocks.schema }),
}));

import { loadOpenRegistrationForm } from "@/lib/registration-service";

const clubId = "11111111-1111-4111-8111-111111111111";
const closedForm = {
  id: "22222222-2222-4222-8222-222222222222",
  club_id: clubId,
  slug: "academy",
  title: "Academy",
  description: "",
  is_minor: false,
  waiver_text: "I agree.",
  status: "closed",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schema.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
});

describe("loadOpenRegistrationForm", () => {
  it("returns a stable closed-form error only after finding the form in the resolved tenant", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: closedForm, error: null });

    await expect(loadOpenRegistrationForm(clubId, "academy"))
      .rejects.toMatchObject({ code: "REGISTRATION_FORM_CLOSED" });

    expect(mocks.eq).toHaveBeenNthCalledWith(1, "club_id", clubId);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "slug", "academy");
  });

  it("does not disclose a missing or another tenant's form", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(loadOpenRegistrationForm(clubId, "academy"))
      .rejects.toMatchObject({ code: "REGISTRATION_FORM_NOT_FOUND" });
  });
});

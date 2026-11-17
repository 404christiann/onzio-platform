import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
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
  participant_mode: "adult_only",
  waiver_text: "I agree.",
  status: "closed",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schema.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
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

  // ADMIN-RE-12b: hiding or closing every program and tryout that uses a form
  // stops its sign-ups, so its page says closed before anyone fills it in.
  describe("an open form whose programs and tryouts take no sign-ups", () => {
    function openFormReads() {
      const openForm = { ...closedForm, status: "open" };
      const result = { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "order"]) chain[name] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: openForm, error: null }));
      chain.then = (resolve: (value: typeof result) => unknown) => resolve(result);
      mocks.from.mockReturnValue(chain);
    }

    it("is reported closed", async () => {
      openFormReads();
      mocks.rpc.mockResolvedValue({ data: false, error: null });
      await expect(loadOpenRegistrationForm(clubId, "academy"))
        .rejects.toMatchObject({ code: "REGISTRATION_FORM_CLOSED" });
      expect(mocks.rpc).toHaveBeenCalledWith("registration_form_accepting", {
        p_club_id: clubId,
        p_form_id: closedForm.id,
      });
    });

    it("fails closed when the check can't be read", async () => {
      openFormReads();
      mocks.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
      await expect(loadOpenRegistrationForm(clubId, "academy")).rejects.toMatchObject({
        code: "REGISTRATION_FORM_READ_FAILED",
      });
    });

    it("loads when one of them is taking sign-ups", async () => {
      openFormReads();
      mocks.rpc.mockResolvedValue({ data: true, error: null });
      await expect(loadOpenRegistrationForm(clubId, "academy")).resolves.toMatchObject({
        form: { status: "open" },
      });
    });
  });
});

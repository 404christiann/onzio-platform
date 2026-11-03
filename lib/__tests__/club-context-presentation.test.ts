import { describe, expect, it, vi } from "vitest";
import { ContractError } from "../contract-error";
import { getClubContextBySlug, resolveActivePresentationTemplateKey } from "../club-context";

describe("published presentation assignment", () => {
  it.each(["cinematic", "heritage", "editorial"])(
    "fails closed for a retired %s assignment",
    (id) => {
      expect(() => resolveActivePresentationTemplateKey({
        schemaVersion: 1,
        template: { id, version: 1 },
      })).toThrowError(new ContractError("UNKNOWN_TENANT"));
    },
  );

  it("fails closed for a malformed assignment", () => {
    expect(() => resolveActivePresentationTemplateKey({ template: null }))
      .toThrowError(new ContractError("UNKNOWN_TENANT"));
  });
});

const { createClient, createPublicClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createPublicClient: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({ createClient, createPublicClient }));

it.each([null, { code: "42501" }])(
  "reads the public published document when membership state is unavailable (%j)",
  async (stateError) => {
    const publicRead = vi.fn().mockResolvedValue({
      data: { configuration: { template: { id: "editorial", version: 1 } } },
      error: null,
    });
    const publicFrom = vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: publicRead }) }),
    });
    createPublicClient.mockReturnValue({ schema: () => ({ from: publicFrom }) });
    createClient.mockResolvedValue({
      schema: () => ({
        from: (table: string) => {
          if (table === "clubs") {
            return { select: () => ({ eq: () => ({
              maybeSingle: async () => ({ data: { id: "test-club", slug: "test-club" } }),
            }) }) };
          }
          if (table === "club_domains") {
            const query = { select: () => query, eq: () => query, not: () => query,
              single: async () => ({ data: { hostname: "test-club.localhost" } }) };
            return query;
          }
          expect(table).toBe("presentation_state");
          return { select: () => ({ eq: () => ({
            maybeSingle: async () => ({ data: null, error: stateError }),
          }) }) };
        },
      }),
    });
    await expect(getClubContextBySlug("test-club")).rejects.toThrowError(new ContractError("UNKNOWN_TENANT"));
    expect(publicFrom).toHaveBeenCalledWith("presentation_documents");
    expect(publicRead).toHaveBeenCalledOnce();
  },
);

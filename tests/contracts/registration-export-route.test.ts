import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), buildCsv: vi.fn() }));
vi.mock("@/lib/registration-route-auth", () => ({ requireRegistrationRouteAuthorization: mocks.requireAuth }));
vi.mock("@/lib/registration-export", () => ({ buildRegistrationExportCsv: mocks.buildCsv }));
import { GET } from "@/app/api/admin/registrations/export/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const formId = "22222222-2222-4222-8222-222222222222";

function request(id = formId) { return new Request(`https://alpha.example/api/admin/registrations/export?formId=${id}`); }

afterEach(() => vi.clearAllMocks());

describe("registration CSV export route", () => {
  it("requires a valid form ID before querying protected data", async () => {
    const response = await GET(request("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });

  it("exports only the current club's paid/refunded roster with no-store CSV headers", async () => {
    const fieldsQuery: any = {
      select: vi.fn(() => fieldsQuery), eq: vi.fn(() => fieldsQuery),
      order: vi.fn().mockResolvedValue({ data: [{ field_key: "player_name", position: 0 }], error: null }),
    };
    const registrationsQuery: any = {
      select: vi.fn(() => registrationsQuery), eq: vi.fn(() => registrationsQuery), in: vi.fn(() => registrationsQuery),
      order: vi.fn().mockResolvedValue({ data: [{ answers: { player_name: "Ada" }, price_label: "Player", amount_cents: 17500, status: "paid", submitted_at: "2026-08-20T00:00:00.000Z" }], error: null }),
    };
    mocks.requireAuth.mockResolvedValue({ club: { id: clubId }, supabase: { schema: vi.fn(() => ({ from: vi.fn((table: string) => table === "registration_form_fields" ? fieldsQuery : registrationsQuery) })) } });
    mocks.buildCsv.mockReturnValue("player_name\r\nAda\r\n");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(registrationsQuery.eq).toHaveBeenCalledWith("club_id", clubId);
    expect(registrationsQuery.eq).toHaveBeenCalledWith("form_id", formId);
    expect(registrationsQuery.in).toHaveBeenCalledWith("status", ["paid", "refunded"]);
    expect(mocks.buildCsv).toHaveBeenCalledWith(
      [expect.objectContaining({ priceLabel: "Player", amountCents: 17500, status: "paid" })],
      ["player_name"],
    );
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(formId);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// The removed reimagined admin's addresses still send a classic club where they always did (lib/retired-admin-route.ts).
// The pages run for real here; only the session, club, request and Next.js navigation are stubbed.

class Navigation extends Error {
  constructor(readonly to: string) {
    super(to);
  }
}

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireFreshClubSession: vi.fn(),
  getClubContext: vi.fn(),
  codeSiteAdminFor: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Navigation(to);
  },
  notFound: () => {
    throw new Navigation("404");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "alpha.example" }) }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/code-site-admin", () => ({ codeSiteAdminFor: mocks.codeSiteAdminFor }));

const userId = "22222222-2222-4222-8222-222222222222";
const NOT_AUTHORIZED = "/admin/login?error=not_authorized";

function club(role: string, slug = "alpha") {
  mocks.getClubContext.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", slug, role });
}

async function open(route: string): Promise<string> {
  const { default: Page } = await import(`@/app/admin/(protected)/${route}/page`);
  try {
    await Page();
  } catch (error) {
    if (error instanceof Navigation) return error.to;
    throw error;
  }
  throw new Error(`${route} rendered instead of redirecting`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({});
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.codeSiteAdminFor.mockReturnValue(null);
});

const ADMIN_ONLY: [string, string][] = [
  ["club", "/admin/branding"],
  ["games", "/admin/schedule"],
  ["games/players/[playerId]", "/admin/schedule"],
  ["programs-and-sign-ups", "/admin"],
  ["website", "/admin/homepage"],
  ["score", "/admin/schedule"],
  ["score/[matchId]", "/admin/stats?view=match"],
  ["seasons/totals", "/admin/stats?view=season"],
  ["your-club", "/admin/branding"],
  ["programs-and-tryouts", "/admin"],
];

describe("retired reimagined-admin addresses", () => {
  it.each(ADMIN_ONLY)("%s sends an owner or admin to %s", async (route, target) => {
    for (const role of ["owner", "admin"]) {
      club(role);
      expect(await open(route)).toBe(target);
    }
    expect(mocks.getClubContext).toHaveBeenCalledWith({ hostname: "alpha.example", userId });
  });

  it.each(ADMIN_ONLY)("%s sends any other role to the not-authorized sign-in", async (route) => {
    for (const role of ["member", "coach", "viewer", ""]) {
      club(role);
      expect(await open(route)).toBe(NOT_AUTHORIZED);
    }
  });

  it("stops at the session check before reading the club", async () => {
    mocks.requireFreshClubSession.mockRejectedValue(new Navigation("/admin/login"));
    expect(await open("seasons/totals")).toBe("/admin/login");
    expect(mocks.getClubContext).not.toHaveBeenCalled();
  });

  it("add-game sends every signed-in role to the schedule, as it always did", async () => {
    for (const role of ["owner", "member"]) {
      club(role);
      expect(await open("add-game")).toBe("/admin/schedule");
    }
  });

  it("sign-ups is not found where Registrations is hidden, else goes to Registrations", async () => {
    club("owner", "rose-city");
    expect(await open("sign-ups")).toBe("404");
    club("member", "alpha");
    expect(await open("sign-ups")).toBe("/admin/registrations");
  });

  it("programs-and-tryouts goes to Tryouts, else Programs, else the dashboard", async () => {
    club("owner");
    mocks.codeSiteAdminFor.mockReturnValue({ tryouts: { routeVisible: true }, programs: { routeVisible: true } });
    expect(await open("programs-and-tryouts")).toBe("/admin/tryouts");
    mocks.codeSiteAdminFor.mockReturnValue({ tryouts: { routeVisible: false }, programs: { routeVisible: true } });
    expect(await open("programs-and-tryouts")).toBe("/admin/programs");
    mocks.codeSiteAdminFor.mockReturnValue({ tryouts: { routeVisible: false }, programs: { routeVisible: false } });
    expect(await open("programs-and-tryouts")).toBe("/admin");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-MATCH-AREA: on a Vercel preview (rc-sam) the host is not a verified club domain, so the middleware picks the
// tenant by slug and rewrites to /_clubs/<slug>. The match route used to look the club up again by Host, got
// UNKNOWN_TENANT, and fell through to the Clubhouse page ("Match area unavailable."). It now resolves by slug like
// every other tenant route and never reads the Host.
const mocks = vi.hoisted(() => ({
  club: vi.fn(), byHost: vi.fn(), host: vi.fn(), schema: vi.fn(), trusted: { tag: "trusted" }, fixture: vi.fn(), identity: vi.fn(),
}));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club, getClubContext: mocks.byHost }));
vi.mock("next/headers", () => ({ headers: mocks.host }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/queries", () => ({ fetchFixtureById: mocks.fixture }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: mocks.identity }));
const { stub } = vi.hoisted(() => ({
  stub: async (name: string) => {
    const { createElement: h } = await import("react");
    return { default: (props: { initial?: unknown; fixtureId?: string }) => h("div", { "data-page": name, "data-fixture": props.fixtureId, "data-initial": JSON.stringify(props.initial ?? null) }) };
  },
}));
vi.mock("@/components/cinematic/CinematicMatchSummaryPage", () => stub("cinematic-match-summary"));
vi.mock("@/components/ClubhouseMatchAreaPage", () => stub("clubhouse-match-area"));
import MatchRoute from "@/app/%5Fclubs/[slug]/schedule/[fixtureId]/page";

const FIXTURE_ID = "baf199e2-bea4-5fc7-840f-e1dc59fefb4d";
const params = { params: Promise.resolve({ slug: "tenant", fixtureId: FIXTURE_ID }) };
const roseCity = { id: "tenant-id", slug: "rose-city", name: "Rose City FC", presentationTemplateKey: "cinematic@2", storeEnabled: true };
const match = { id: FIXTURE_ID, opponent: "Ocelot FC", date: "2027-05-02", roseCityScore: 2, opponentScore: 1 };
// The route returns the site package's async server page; resolve async components the way the server does.
async function resolveAsync(node: React.ReactElement): Promise<React.ReactElement> {
  const type = node.type as unknown;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolveAsync(await (type as (props: unknown) => Promise<React.ReactElement>)(node.props));
  }
  return node;
}
const html = async () => renderToStaticMarkup(await resolveAsync(await MatchRoute(params)));
const parse = (markup: string) => JSON.parse(/data-initial="([^"]*)"/.exec(markup)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'")) as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.schema.mockReturnValue(mocks.trusted);
  mocks.club.mockResolvedValue(roseCity);
  // rc-sam: no club_domains row for the preview host.
  mocks.host.mockResolvedValue(new Headers({ host: "onzio-platform-git-rc-sam-example.vercel.app" }));
  mocks.byHost.mockRejectedValue(new Error("UNKNOWN_TENANT"));
  mocks.fixture.mockResolvedValue(match);
  mocks.identity.mockResolvedValue({ initials: "RCFC" });
});

describe("the tenant match route for Rose City", () => {
  it("renders the cinematic match summary, not the Clubhouse page, even though the Host is not a club domain", async () => {
    const markup = await html();
    expect(markup).toContain('data-page="cinematic-match-summary"');
    expect(markup).not.toContain("clubhouse-match-area");
    expect(markup).toContain(`data-fixture="${FIXTURE_ID}"`);
  });

  it("resolves the club by slug and never by Host", async () => {
    await html();
    expect(mocks.club).toHaveBeenCalledWith("tenant");
    expect(mocks.byHost).not.toHaveBeenCalled();
    expect(mocks.host).not.toHaveBeenCalled();
  });

  it("fetches the match and the club label on the server with the request client, for this club only", async () => {
    const initial = parse(await html());
    expect(mocks.schema).toHaveBeenCalledWith("onzio");
    expect(mocks.fixture).toHaveBeenCalledWith(FIXTURE_ID, "tenant-id", mocks.trusted);
    expect(mocks.identity).toHaveBeenCalledWith("tenant-id", mocks.trusted);
    expect(initial).toEqual({ failed: false, data: { fixture: match, clubLabel: "RCFC" } });
  });

  it("labels the club by name when it has no initials", async () => {
    mocks.identity.mockResolvedValue(null);
    expect(parse(await html()).data.clubLabel).toBe("Rose City FC");
  });

  it("passes an unknown or other-club match through as no match, so the page says it could not find it", async () => {
    mocks.fixture.mockResolvedValue(null);
    expect(parse(await html())).toEqual({ failed: false, data: { fixture: null, clubLabel: "RCFC" } });
  });

  it("passes a failed read as data instead of crashing", async () => {
    mocks.fixture.mockRejectedValue(new Error("boom"));
    expect(parse(await html())).toEqual({ failed: true, data: null });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("every other club's match route", () => {
  it.each(["diverse-city", "alpha", "bravo"])("still renders the shared match page for %s and fetches nothing", async (slug) => {
    mocks.club.mockResolvedValue({ ...roseCity, slug, presentationTemplateKey: "academy@1" });
    const markup = await html();
    expect(markup).toContain('data-page="clubhouse-match-area"');
    expect(markup).toContain(`data-fixture="${FIXTURE_ID}"`);
    expect(markup).not.toContain("cinematic-match-summary");
    expect(mocks.fixture).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.byHost).not.toHaveBeenCalled();
  });
});

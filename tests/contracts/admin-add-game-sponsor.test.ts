import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import {
  opponentCarry,
  opponentKey,
  rememberOpponents,
  sponsorChoices,
  sponsorPayload,
  UNNAMED_SPONSOR,
} from "@/lib/admin-add-game-data";

// ADMIN-RE-07b: Add a game's "Sponsor?" question and the quiet reuse of an
// opponent's short name and logo. Pins what is offered, what a new game is
// saved with, where the question shows, and the tenant rules.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = source("app/admin/(protected)/add-game/page.tsx");
const form = source("components/admin/reimagined/AddGame.tsx");
const loader = source("lib/admin-add-game-data.ts");
const sponsorsPage = source("app/admin/(protected)/sponsors/page.tsx");

const ASSET = "22222222-2222-4222-8222-222222222222";
const OTHER_ASSET = "33333333-3333-4333-8333-333333333333";
const GAME = {
  season_id: "11111111-1111-4111-8111-111111111111",
  date: "2026-11-14",
  time: "10:00",
  opponent: "Northgate",
  home: true,
  venue: "Lincoln Park",
};
const opponentRow = (
  opponent: string,
  shortName: string | null,
  logoUrl: string | null,
  logoAssetId: string | null = null,
) => ({
  opponent,
  opponent_short_name: shortName,
  opponent_logo_url: logoUrl,
  opponent_logo_asset_id: logoAssetId,
});

describe("an opponent played before (newest games first)", () => {
  it("is the same opponent whatever the case or outer spaces", () => {
    expect(opponentKey("  Northgate FC ")).toBe(opponentKey("northgate fc"));
    expect(opponentKey("Northgate FC")).not.toBe(opponentKey("Northgate"));
  });

  it("keeps the newest short name and the newest logo, with its asset", () => {
    const remembered = rememberOpponents([
      opponentRow("Northgate", "NGT", "https://cdn.test/new.png", ASSET),
      opponentRow("northgate ", "OLD", "https://cdn.test/old.png", OTHER_ASSET),
    ]);
    expect(remembered).toEqual([
      { key: "northgate", shortName: "NGT", logoUrl: "https://cdn.test/new.png", logoAssetId: ASSET },
    ]);
  });

  it("does not lose a short name or logo to a newer game saved without them", () => {
    const remembered = rememberOpponents([
      opponentRow("Northgate", null, null),
      opponentRow("Northgate", "  ", "https://cdn.test/logo.png"),
      opponentRow("Northgate", "NGT", "https://cdn.test/older.png"),
    ]);
    expect(remembered).toEqual([
      { key: "northgate", shortName: "NGT", logoUrl: "https://cdn.test/logo.png", logoAssetId: null },
    ]);
  });

  it("never reuses a short name a new game could not be saved with", () => {
    const remembered = rememberOpponents([opponentRow("Northgate", "x".repeat(21), null)]);
    expect(remembered).toEqual([]);
  });

  it("fills in only what it knows, and nothing for a new opponent", () => {
    const remembered = rememberOpponents([
      opponentRow("Northgate", "NGT", "https://cdn.test/logo.png", ASSET),
      opponentRow("Eastside", "EST", null),
    ]);
    expect(opponentCarry(remembered, "  NORTHGATE ")).toEqual({
      opponent_short_name: "NGT",
      opponent_logo_url: "https://cdn.test/logo.png",
      opponent_logo_asset_id: ASSET,
    });
    expect(opponentCarry(remembered, "eastside")).toEqual({ opponent_short_name: "EST" });
    expect(opponentCarry(remembered, "Westview")).toEqual({});
    expect(opponentCarry(remembered, "   ")).toEqual({});
  });
});

describe("Sponsor? choices", () => {
  const latest = {
    sponsor_name: " Acme Plumbing ",
    sponsor_logo_url: "https://cdn.test/acme.png",
    sponsor_logo_asset_id: ASSET,
    sponsor_link: "https://acme.test",
  };
  const pageRows = [
    { name: "acme plumbing", logo_url: "https://cdn.test/acme-2.png", media_asset_id: OTHER_ASSET },
    { name: "Riverside Bank", logo_url: "https://cdn.test/bank.png", media_asset_id: OTHER_ASSET },
    { name: "Riverside Bank", logo_url: "https://cdn.test/bank-footer.png", media_asset_id: null },
    { name: "  ", logo_url: "https://cdn.test/blank.png", media_asset_id: null },
  ];

  it("offers the latest game's sponsor first, with its link, then each Sponsors-page sponsor once, without a link", () => {
    expect(sponsorChoices(latest, pageRows)).toEqual([
      {
        name: "Acme Plumbing",
        logoUrl: "https://cdn.test/acme.png",
        logoAssetId: ASSET,
        link: "https://acme.test",
        from: "last-game",
      },
      {
        name: "Riverside Bank",
        logoUrl: "https://cdn.test/bank.png",
        logoAssetId: OTHER_ASSET,
        link: null,
        from: "sponsors-page",
      },
    ]);
  });

  it("offers only the Sponsors page when the latest game had no sponsor", () => {
    const empty = { sponsor_name: null, sponsor_logo_url: " ", sponsor_logo_asset_id: null, sponsor_link: "https://x.test" };
    expect(sponsorChoices(empty, pageRows).map((choice) => choice.from)).toEqual(["sponsors-page", "sponsors-page"]);
    expect(sponsorChoices(null, [])).toEqual([]);
  });

  it("names a latest sponsor saved with a logo but no name, and saves it without inventing a name", () => {
    const [choice] = sponsorChoices(
      { sponsor_name: null, sponsor_logo_url: "https://cdn.test/logo.png", sponsor_logo_asset_id: null, sponsor_link: null },
      [],
    );
    expect(choice.name).toBe(UNNAMED_SPONSOR);
    expect(sponsorPayload(choice).sponsor_name).toBeNull();
    expect(sponsorPayload(choice).sponsor_logo_url).toBe("https://cdn.test/logo.png");
  });

  it("saves No sponsor as empty sponsor columns", () => {
    expect(sponsorPayload(null)).toEqual({
      sponsor_name: null,
      sponsor_logo_url: null,
      sponsor_logo_asset_id: null,
      sponsor_link: null,
    });
  });

  it("is a game insert /api/admin/data accepts, with no tenant identity", () => {
    const remembered = rememberOpponents([opponentRow("Northgate", "NGT", "https://cdn.test/logo.png", ASSET)]);
    for (const choice of [...sponsorChoices(latest, pageRows), null]) {
      const payload = { ...GAME, ...opponentCarry(remembered, GAME.opponent), ...sponsorPayload(choice) };
      expect(payload).not.toHaveProperty("club_id");
      expect(adminDataRequestSchema.safeParse({ table: "matches", operation: "insert", payload }).success).toBe(true);
    }
  });
});

describe("Add a game form (ADMIN-RE-07b)", () => {
  it("asks Sponsor? only where the club's website shows match sponsors, the classic form's rule", () => {
    expect(diverseCitySite.admin.schedule.showMatchSponsorFields).toBe(false);
    expect(page).toContain("const showSponsors = codeSiteAdminFor(club)?.schedule.showMatchSponsorFields !== false;");
    expect(page).toContain("loadAddGameData(supabase, club.id, portal.timeZone, { showSponsors, showCompetition })");
    expect(page).toContain("showSponsors={showSponsors}");
    expect(loader).toContain("showSponsors ? readSponsors(supabase, clubId).catch(() => []) : Promise.resolve([])");
    expect(form).toContain("{showSponsors ? (");
    expect(form).toContain("...(showSponsors ? sponsorPayload(sponsor) : {}),");
  });

  it("comes filled in with the latest game's sponsor, and offers No sponsor", () => {
    expect(form).toContain('sponsors[0]?.from === "last-game" ? "0" : NO_SPONSOR');
    expect(form).toContain("Sponsor?");
    expect(form).toContain('<option value={NO_SPONSOR}>No sponsor</option>');
  });

  it("says No sponsor and links to the Sponsors page when there is nothing to pick", () => {
    expect(form).toContain("No sponsor.");
    expect(form).toContain('href="/admin/sponsors"');
  });

  it("reuses the opponent quietly and uploads nothing", () => {
    expect(form).toContain("...opponentCarry(opponents, name),");
    expect(form).not.toMatch(/storage|FileUpload|type="file"/);
    expect(form).not.toMatch(/club_id/);
  });

  it("reads with the signed-in person's client, every read scoped to the club", () => {
    expect(loader).not.toMatch(/service-role|SERVICE_ROLE|createAdminClient/);
    expect(loader.match(/\.eq\("club_id", clubId\)/g)).toHaveLength(7);
    expect(loader.match(/\.from\("/g)).toHaveLength(7);
    expect(loader).toContain('.select("opponent,opponent_short_name,opponent_logo_url,opponent_logo_asset_id")');
    expect(loader).toContain('.select("sponsor_name,sponsor_logo_url,sponsor_logo_asset_id,sponsor_link")');
    expect(loader).toContain('.select("name,logo_url,media_asset_id")');
  });
});

describe("Sponsors page keeps a logo a game still shows", () => {
  it("checks the games before deleting a sponsor logo file", () => {
    expect(sponsorsPage).toContain('.from("matches")');
    expect(sponsorsPage).toContain('.eq("sponsor_logo_url", url);');
    expect(sponsorsPage).toContain("if (!games.error && (games.count ?? 0) === 0) unusedUrls.push(url);");
  });
});

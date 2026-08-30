import { describe, expect, it } from "vitest";
import type { LionsMediaImportPlan } from "@/lib/migration/lions-media-plan";
import {
  buildLionsLocalImportRows,
  LIONS_LOCAL_HOSTNAME,
  LIONS_LOCAL_TENANT_ID,
  reconcileLionsLocalImportPlan,
} from "@/lib/migration/lions-media-local-import";
import manifest from "@/docs/phase-9/lions-media-import-plan.json";

const plan = manifest as unknown as LionsMediaImportPlan;

describe("local LionsFC media import rows", () => {
  it("builds deterministic local tenant, media, and content rows", () => {
    const first = buildLionsLocalImportRows(plan);
    const second = buildLionsLocalImportRows(plan);

    expect(second).toEqual(first);
    expect(first.club).toMatchObject({
      id: LIONS_LOCAL_TENANT_ID,
      slug: "lions",
      lifecycle: "active",
      public_access: "live",
      tier: "pro",
      primary_color: "#1B2958",
      secondary_color: "#AD3234",
      accent_color: "#F0F0F0",
    });
    expect(first.domain).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      hostname: LIONS_LOCAL_HOSTNAME,
      environment: "staging",
      active: true,
    });
    expect(first.subscription).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      status: "active",
      tier: "pro",
    });
    expect(first.mediaAssets).toHaveLength(10);
    expect(
      first.mediaAssets.find((asset) =>
        String(asset.storage_path).includes("branding"),
      ),
    ).toBeTruthy();
    expect(first.seasons).toHaveLength(2);
    expect(first.matches).toHaveLength(4);
    expect(first.players).toHaveLength(32);
    expect(first.playerSeasonStats).toHaveLength(28);
    expect(first.goalkeeperSeasonStats).toHaveLength(4);
    expect(first.staff).toHaveLength(6);
    expect(first.players.every((player) => player.nationality === "American")).toBe(true);
    expect(first.staff.every((member) => member.nationality === "American")).toBe(true);
    expect(first.players.map((player) => player.id)).toEqual(
      [...new Set(first.players.map((player) => player.id))],
    );
    expect(first.players[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(first.matches[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(first.staff.map((member) => member.id)).toEqual(
      [...new Set(first.staff.map((member) => member.id))],
    );
    expect(first.presentationDocument).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      version: 1,
      schema_version: 1,
      template_id: "editorial",
      template_version: 1,
    });
    expect(first.presentationState).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      published_document_id: first.presentationDocument.id,
    });
    expect(first.presentationPublication).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      action: "publish",
      next_document_id: first.presentationDocument.id,
    });
    expect(first.homepageHeroContent).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      headline_line_one: "Capital City.",
      headline_line_two: "Roar as One.",
      intro:
        "Columbus-built football, carried by a club that plays for the city and every supporter behind it.",
      primary_cta_href: "/schedule",
      secondary_cta_href: "/roster",
    });
    expect(first.homepageSlideshowPhotos).toHaveLength(5);
    expect(first.shopKitPhotos).toHaveLength(3);
    expect(first.shopCarouselPhotos).toHaveLength(3);
    expect(first.aboutPageContent).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      hero_title: "A club shaped by Columbus.",
      values_heading: "What defines us",
    });
    expect(first.siteSponsorLogos).toHaveLength(6);

    // Lions E7: editorial@1 content tables the E5/E6 pages actually read
    // from (club_identity, contact_profile, contact_page_content, tryouts,
    // tryouts_page_content).
    expect(first.clubIdentity).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      short_name: "Lions FC",
      initials: "LFC",
    });
    expect(first.contactProfile).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
      public_email: "columbuslionsfc@gmail.com",
    });
    expect(first.contactPageContent).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
    });
    expect(first.tryouts).toHaveLength(3);
    expect(first.tryouts.map((tryout) => tryout.status).sort()).toEqual([
      "closed",
      "open",
      "upcoming",
    ]);
    expect(
      first.tryouts.find((tryout) => tryout.status === "open"),
    ).toMatchObject({
      registration_href: "https://forms.gle/lionsfc-academy-tryouts",
      cta_label: "Register Now",
    });
    expect(
      first.tryouts.find((tryout) => tryout.status === "closed"),
    ).toMatchObject({
      closed_message:
        "Registration for this session has closed. Check back for the next U23 identification camp.",
    });
    expect(first.tryoutsPageContent).toMatchObject({
      club_id: LIONS_LOCAL_TENANT_ID,
    });
  });

  it("links content only through local Onzio media paths and media asset IDs", () => {
    const rows = buildLionsLocalImportRows(plan);
    const mediaAssetIds = new Set(rows.mediaAssets.map((asset) => asset.id));
    const content = [
      rows.siteBranding,
      rows.homepageHeroContent,
      ...rows.homepageSlideshowPhotos,
      ...rows.shopKitPhotos,
      ...rows.shopCarouselPhotos,
      rows.aboutPageContent,
    ];

    expect(JSON.stringify(content)).not.toContain("ydvggllbrswfchgjhjhr");
    expect(JSON.stringify(content)).not.toContain("/storage/v1/render/image/");
    expect(JSON.stringify(content)).not.toContain("/_next/image");
    expect(rows.siteBranding.club_logo_path).toMatch(
      new RegExp(`^${LIONS_LOCAL_TENANT_ID}/branding/[0-9a-f-]{36}\\.webp$`),
    );
    expect(rows.siteBranding.inverse_logo_path).toMatch(
      new RegExp(`^${LIONS_LOCAL_TENANT_ID}/branding/[0-9a-f-]{36}\\.webp$`),
    );
    for (const row of content) {
      if ("media_asset_id" in row && row.media_asset_id) {
        expect(mediaAssetIds.has(row.media_asset_id)).toBe(true);
      }
      if ("club_logo_asset_id" in row && row.club_logo_asset_id) {
        expect(mediaAssetIds.has(row.club_logo_asset_id)).toBe(true);
      }
      if ("inverse_logo_asset_id" in row && row.inverse_logo_asset_id) {
        expect(mediaAssetIds.has(row.inverse_logo_asset_id)).toBe(true);
      }
    }
  });

  it("reconciles planned counts, checksums, and relationships", () => {
    expect(reconcileLionsLocalImportPlan(plan)).toEqual({
      tenantId: LIONS_LOCAL_TENANT_ID,
      assetCount: 10,
      mediaAssetCount: 10,
      homepageHeroContentCount: 1,
      homepageSlideshowPhotoCount: 5,
      shopKitPhotoCount: 3,
      shopCarouselPhotoCount: 3,
      matchCount: 4,
      playerCount: 32,
      playerSeasonStatsCount: 28,
      goalkeeperSeasonStatsCount: 4,
      staffCount: 6,
      presentationDocumentCount: 1,
      presentationStateCount: 1,
      presentationPublicationCount: 1,
      sponsorLogoCount: 6,
      clubIdentityCount: 1,
      contactProfileCount: 1,
      contactPageContentCount: 1,
      tryoutCount: 3,
      tryoutsPageContentCount: 1,
      readyContentLinkCount: 13,
      blockedContentLinkCount: 0,
      sourceChecksumCount: 10,
      normalizedChecksumCount: 10,
      relationshipCount: 14,
      oldSourceUrlReferences: 0,
      hostedMutations: 0,
    });
  });

  it("refuses a hosted or mismatched destination plan", () => {
    expect(() =>
      buildLionsLocalImportRows({
        ...plan,
        destination: {
          ...plan.destination,
          environment: "production",
        },
      }),
    ).toThrow(/Unexpected Lions media plan/);

    expect(() =>
      buildLionsLocalImportRows({
        ...plan,
        destination: {
          ...plan.destination,
          tenantId: "11111111-1111-4111-8111-111111111111",
        },
      }),
    ).toThrow(/Unexpected Lions media plan/);
  });
});

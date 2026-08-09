import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeMediaRequestSchema } from "@/lib/media-api-contract";
import { describeMediaRequestValidationFailure } from "@/lib/media-diagnostics";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const SHOP_ADMIN = "app/admin/(protected)/shop/page.tsx";
const SCHEDULE_ADMIN = "app/admin/(protected)/schedule/page.tsx";
const DATA_ROUTE = "app/api/admin/data/route.ts";
const AUTHORIZE_ROUTE = "app/api/admin/media/authorize/route.ts";
const ACADEMY_NEXT_MATCH = "components/AcademyNextMatch.tsx";
const PUBLIC_SCHEDULE = "app/(public)/schedule/page.tsx";

/**
 * Christian reported four admin-portal failures against the live Diverse City
 * portal. Three were real defects; each assertion below pins the specific
 * regression rather than the general shape of the file.
 */
describe("Diverse City admin punch list", () => {
  describe("shop kit save no longer sends a client tenant filter", () => {
    // Reproduced live: /api/admin/data rejects *any* filter on `club_id` before
    // it ever reaches authorizeMutation's payload check, so the shop editor's
    // `.eq("club_id", clubId)` made every kit save fail with
    // UNTRUSTED_TENANT_INPUT. The payload itself was always clean.
    it("rejects a club_id filter server-side, which is why the client must not send one", () => {
      const route = source(DATA_ROUTE);
      expect(route).toContain('filter.column === "club_id"');
      expect(route).toContain('errorResponse("UNTRUSTED_TENANT_INPUT", 400)');
    });

    it("scopes every mutation to the server-resolved club without client help", () => {
      const route = source(DATA_ROUTE);
      // update/delete are filtered, and every payload row has the verified
      // club injected, so the client filter was never load-bearing.
      expect(route).toContain('.eq("club_id", club.id)');
      expect(route).toContain("club_id: clubId");
    });

    it("does not filter any admin mutation on club_id from the browser", () => {
      // The whole point of the fix: no client admin page may send this filter.
      // `lib/admin-client.ts` is the only browser path to /api/admin/data.
      expect(source(SHOP_ADMIN)).not.toContain('.eq("club_id"');
      expect(source(SCHEDULE_ADMIN)).not.toContain('.eq("club_id"');
    });

    it("upserts the kit section so a never-saved variant persists its content", () => {
      // Second defect found during the same reproduction: an UPDATE matched
      // zero rows for a kit variant with no row yet (the Away kit), so photos
      // saved while the title, description, and bullets were silently dropped.
      const shop = source(SHOP_ADMIN);
      const section = shop.slice(shop.indexOf('.from("shop_kit_section")'));
      expect(section.slice(0, 400)).toContain(".upsert(");
      expect(section.slice(0, 400)).not.toContain(".update(");
      // The conflict target the (club_id, surface, kit_variant) unique
      // constraint backs; the route prefixes the verified club itself.
      expect(section).toContain('onConflict: "surface,kit_variant"');
      expect(section.slice(0, 400)).toContain("surface: selectedSurface");
      expect(section.slice(0, 400)).toContain("kit_variant: activeKitVariant");
    });
  });

  describe("schedule admin hides dead sponsor fields for academy@1 only", () => {
    // academy@1 renders fixtures through AcademyNextMatch/AcademyFixtureRow,
    // neither of which reads any sponsor column, so the editor collected data
    // that could never appear. Same shape as DCFC-D130.
    it("confirms the academy fixture components never render match sponsors", () => {
      const academy =
        source("components/AcademyNextMatch.tsx") +
        source("components/AcademyFixtureRow.tsx");
      for (const field of [
        "sponsor_name",
        "sponsor_logo_url",
        "sponsor_link",
        "sponsorName",
        "sponsorLogoUrl",
        "sponsorLink",
      ]) {
        expect(academy, field).not.toContain(field);
      }
    });

    it("still renders match sponsors for the templates that use them", () => {
      // Guards against the hide being widened into a deletion. Rose City
      // (clubhouse@1) renders these through NextMatchCard.
      const nextMatchCard = source("components/NextMatchCard.tsx");
      expect(nextMatchCard).toContain("sponsorLogoUrl");
      expect(nextMatchCard).toContain("sponsorName");
    });

    it("gates the sponsor inputs behind the academy@1 check", () => {
      const schedule = source(SCHEDULE_ADMIN);
      expect(schedule).toContain(
        'club.presentationTemplateKey === "academy@1"',
      );
      expect(schedule).toContain("{!isAcademy && (");
      // The copy-forward must not seed a hidden field either.
      expect(schedule).toContain(
        "isAcademy ? {} : carrySponsorFromLatestMatch(list, seasonId)",
      );
      expect(schedule).not.toContain(
        "...carrySponsorFromLatestMatch(matches, selectedSeasonId)",
      );
    });

    it("keeps the sponsor columns, upload, and cleanup logic intact", () => {
      // A pure admin-UI hide: nothing about persistence changes, so a template
      // switch would restore the fields with their data still present.
      const schedule = source(SCHEDULE_ADMIN);
      expect(schedule).toContain("sponsor_name: editForm.sponsor_name");
      expect(schedule).toContain("sponsor_logo_url: editForm.sponsor_logo_url");
      expect(schedule).toContain("sponsor_link: editForm.sponsor_link");
      expect(schedule).toContain("SponsorLogoUpload");
      expect(schedule).toContain('column: "sponsor_logo_url"');
    });
  });

  describe("media authorize returns a readable message, not a Zod dump", () => {
    it("no longer returns parsed.error.message verbatim", () => {
      const route = source(AUTHORIZE_ROUTE);
      expect(route).not.toContain("message: parsed.error.message");
      expect(route).toContain("describeMediaRequestValidationFailure");
    });

    it("names the rejected file type for the HEIC case Christian hit", () => {
      const parsed = authorizeMediaRequestSchema.safeParse({
        surface: "about",
        kind: "photo",
        fileName: "IMG_4821.HEIC",
        mimeType: "image/heic",
        size: 2_400_000,
      });
      expect(parsed.success).toBe(false);
      if (parsed.success) return;

      const message = describeMediaRequestValidationFailure(
        parsed.error.issues,
        {
          surface: "about",
          kind: "photo",
          fileName: "IMG_4821.HEIC",
          mimeType: "image/heic",
          size: 2_400_000,
        },
      );
      expect(message).toContain("JPEG, PNG, or WebP");
      expect(message).toContain("HEIC");
      // The raw Zod shape must not survive into the admin-facing string.
      expect(message).not.toContain("invalid_value");
      expect(message).not.toContain("mimeType");
      expect(message).not.toContain("[");
    });

    it("explains a browser that reported no file type at all", () => {
      const body = {
        surface: "about",
        kind: "photo",
        fileName: "photo.heic",
        mimeType: "",
        size: 2_400_000,
      };
      const parsed = authorizeMediaRequestSchema.safeParse(body);
      expect(parsed.success).toBe(false);
      if (parsed.success) return;

      const message = describeMediaRequestValidationFailure(
        parsed.error.issues,
        body,
      );
      expect(message).toContain("JPEG, PNG, or WebP");
      expect(message).not.toContain("invalid_value");
    });

    it("explains an oversized file in megabytes", () => {
      const body = {
        surface: "about",
        kind: "photo",
        fileName: "big.jpg",
        mimeType: "image/jpeg",
        size: 40 * 1024 * 1024,
      };
      const parsed = authorizeMediaRequestSchema.safeParse(body);
      expect(parsed.success).toBe(false);
      if (parsed.success) return;

      const message = describeMediaRequestValidationFailure(
        parsed.error.issues,
        body,
      );
      expect(message).toContain("15 MB");
      expect(message).toContain("40.0 MB");
    });

    it("still refuses to widen the accepted format list", () => {
      // Adding HEIC needs real sharp/libvips decode support and is an open
      // decision for Christian, not something a diagnostics change may imply.
      expect(source("lib/media-api-contract.ts")).toContain(
        'z.enum(["image/jpeg", "image/png", "image/webp"])',
      );
    });
  });

  describe("homepage Next Match matches /schedule's active-season scope", () => {
    // Confirmed by reproduction: no bug in how the opponent logo itself is
    // saved or resolved. But AcademyNextMatch fetched fixtures across every
    // season while /schedule scopes to the active one, so the homepage could
    // spotlight a fixture /schedule never lists. Christian confirmed the
    // homepage should match /schedule's scope.
    it("fetches the active season before fetching fixtures", () => {
      const component = source(ACADEMY_NEXT_MATCH);
      expect(component).toContain("fetchActiveSeason(club.id)");
      expect(component).toContain(
        "activeSeason ? fetchSchedule(activeSeason.id, club.id) : []",
      );
      expect(component).not.toContain("fetchSchedule(undefined, club.id)");
    });

    it("uses the same active-season pattern the public /schedule page uses", () => {
      const publicSchedule = source(PUBLIC_SCHEDULE);
      expect(publicSchedule).toContain("fetchActiveSeason(clubId)");
      expect(publicSchedule).toContain("fetchSchedule(activeSeason.id, clubId)");
    });
  });
});

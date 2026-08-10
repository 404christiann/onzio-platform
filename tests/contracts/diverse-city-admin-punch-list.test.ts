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
const ADMIN_CLIENT = "lib/admin-client.ts";
const ACADEMY_SHOP_PAGE = "components/AcademyShopPage.tsx";
const ROSTER_ADMIN = "app/admin/(protected)/roster/page.tsx";
const PROGRAMS_ADMIN = "app/admin/(protected)/programs/page.tsx";
const TRYOUTS_ADMIN = "app/admin/(protected)/tryouts/page.tsx";
const HOMEPAGE_ADMIN = "app/admin/(protected)/homepage/page.tsx";
const BRANDING_ADMIN = "app/admin/(protected)/branding/page.tsx";

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

  describe("removing an image now clears its stale asset reference, platform-wide", () => {
    // Christian removed a match's opponent logo: the admin showed it gone
    // (local draft state), but the public site kept showing the old crest.
    // attachMediaReferences skipped every field whose value wasn't a string,
    // so clearing a url (setting it to null) never nulled the paired
    // *_asset_id column. resolveMediaReferences re-derives the url from that
    // asset_id on every public read regardless of what the raw url column
    // says, so the stale asset kept winning forever. This is not
    // schedule-specific: every table in MEDIA_REFERENCE_FIELDS (matches,
    // about_page_content, site_branding, players, staff, league_standings,
    // shop_kit_photos, and more) shared the same bug.
    it("nulls the asset id when the url is explicitly cleared", () => {
      const client = source(ADMIN_CLIENT);
      const loop = client.slice(
        client.indexOf("for (const { source, asset } of fields)"),
      );
      const body = loop.slice(0, loop.indexOf("\n    return row;"));
      expect(body).toContain(
        'Object.prototype.hasOwnProperty.call(row, source)',
      );
      expect(body).toContain('sourceValue.trim() === ""');
      expect(body).toContain("row[asset] = null");
    });

    it("leaves the asset reference alone when a save never touches that field", () => {
      // The fix must not null out an unrelated image just because a save
      // (e.g. changing a match's date) didn't include that field at all: the
      // hasOwnProperty guard must run, and continue, before the clearing
      // logic below it ever sees a missing field.
      const client = source(ADMIN_CLIENT);
      const loop = client.slice(
        client.indexOf("for (const { source, asset } of fields)"),
      );
      const body = loop.slice(0, loop.indexOf("\n    return row;"));
      const guardIndex = body.indexOf("hasOwnProperty");
      const clearIndex = body.indexOf("row[asset] = null");
      expect(guardIndex).toBeGreaterThan(-1);
      expect(clearIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeLessThan(clearIndex);
      expect(
        body.slice(guardIndex, body.indexOf("\n", guardIndex)),
      ).toContain("continue");
    });
  });

  describe("Away kit hidden in Shop admin for academy@1 — it's never displayed", () => {
    // AcademyShopPage fetches fetchShopKitVariants's home/third/away triple
    // but only ever reads .home; third and away are fetched and discarded.
    // Confirmed directly, not assumed: nothing in the component reads either.
    it("confirms AcademyShopPage only ever uses the home kit variant", () => {
      const page = source(ACADEMY_SHOP_PAGE);
      expect(page).toContain("setContent(variants.home)");
      expect(page).not.toContain("variants.away");
      expect(page).not.toContain("variants.third");
    });

    it("hides both Third and Away kit tabs for academy@1, keeping only Home", () => {
      const shop = source(SHOP_ADMIN);
      expect(shop).toContain(
        'KIT_VARIANTS.filter((variant) => variant.id === "home")',
      );
    });

    it("hides the now-single-option kit switcher instead of leaving dead UI", () => {
      const shop = source(SHOP_ADMIN);
      expect(shop).toContain('selectedSurface === "shop" && kitVariants.length > 1');
    });

    it("still offers Third and Away for every other template", () => {
      // Rose City (clubhouse@1) uses ClubhouseShopPage/ClubhouseHomePage,
      // which render all three kits — this must stay reachable.
      const clubhouseHome = source("components/ClubhouseHomePage.tsx");
      const clubhouseShop = source("components/ClubhouseShopPage.tsx");
      expect(clubhouseHome + clubhouseShop).toContain("third");
    });
  });

  describe("Schedule admin no longer hardcodes \"Rose City\" for any club", () => {
    // Every club's own admin was showing "Rose City Score" and
    // "Result: Rose City X - Y opponent" regardless of which club was actually
    // using the portal. Platform-wide, not academy@1-specific.
    it("uses the club's own name in the score label and result line", () => {
      const schedule = source(SCHEDULE_ADMIN);
      expect(schedule).not.toContain("Rose City");
      expect(schedule).toContain("`${club.name} Score (optional)`");
      expect(schedule).toContain("Result: {club.name}");
    });
  });

  describe("Staff/Roster: photo removal and club-logo fallback", () => {
    // Neither Players nor Staff had a way to clear a photo back to the club
    // logo once one was set (only "Change Photo", never "Remove"), and Staff's
    // empty state showed initials instead of the logo Players already fell
    // back to via getRosterImageSrc/isRosterPlaceholderLogo.
    it("gives both Players and Staff a Remove control that only shows when there's something to remove", () => {
      // The Remove button itself now lives in the shared FileUpload
      // component (rendered only when `onRemove` is passed); roster.tsx
      // supplies that prop conditionally instead of inlining its own button.
      const roster = source(ROSTER_ADMIN);
      const conditionalRemoveCount = roster.split(
        "onRemove={previewIsClubLogo ? undefined :",
      ).length - 1;
      expect(conditionalRemoveCount).toBe(2);

      const fileUpload = source("components/admin/FileUpload.tsx");
      expect(fileUpload).toContain("{onRemove && (");
    });

    it("removing a photo clears photo_url so the fallback takes over", () => {
      const roster = source(ROSTER_ADMIN);
      expect(roster).toContain('onChange({ ...form, photo_url: "" })');
    });

    it("Staff now falls back to the club logo instead of initials, matching Players", () => {
      const roster = source(ROSTER_ADMIN);
      // The old initials-only fallback in the Staff list row and edit form
      // must be gone; both surfaces resolve through the shared roster-image
      // helpers instead.
      expect(roster).not.toContain("{s.initials}");
      const staffFieldsIndex = roster.indexOf("function StaffFormFields");
      const staffTabIndex = roster.indexOf("function StaffTab");
      const staffFields = roster.slice(staffFieldsIndex);
      const staffTab = roster.slice(staffTabIndex, staffFieldsIndex);
      expect(staffFields).toContain("getRosterImageSrc(form.photo_url, clubLogoUrl)");
      expect(staffFields).toContain("isRosterPlaceholderLogo(form.photo_url)");
      expect(staffTab).toContain("getRosterImageSrc(s.photo_url, clubLogoUrl)");
    });

    it("Staff saves run photo_url through rosterImageForStorage, matching Players", () => {
      const roster = source(ROSTER_ADMIN);
      const matches = roster.match(/rosterImageForStorage\(\w+\.photo_url\)/g) ?? [];
      // Two for players (add/edit) already existed; two more for staff (add/edit).
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("template-default text fields show real text, not just a placeholder hint", () => {
    // Christian: the box looked empty even though the live page showed real
    // text -- there was no visible difference between "nothing here yet" and
    // "the real text is on the site." Fixed in four places he named. Choice
    // confirmed with him: an unedited save now writes the literal default
    // text (not blank), trading away silent future-template-update
    // inheritance for a box that never looks empty when it isn't.

    it("Programs Registration tab: no placeholder props remain on the copy fields", () => {
      const programs = source(PROGRAMS_ADMIN);
      expect(programs).not.toContain("placeholder={DEFAULT_PROGRAM_REGISTRATION_CONTENT");
      expect(programs).not.toContain("DEFAULT_PROGRAM_REGISTRATION_CONTENT");
    });

    it("Programs: programToDraft resolves registration copy against the template default", () => {
      const admin = source("lib/program-admin.ts");
      expect(admin).toContain("resolveProgramRegistration(row)");
      expect(admin).toContain("registrationEyebrow: registration.eyebrow");
    });

    it("Tryouts page intro: no placeholder props remain on the copy fields", () => {
      const tryouts = source(TRYOUTS_ADMIN);
      expect(tryouts).not.toContain("placeholder={DEFAULT_TRYOUTS_PAGE_CONTENT");
    });

    it("Tryouts: emptyTryoutsPageDraft and tryoutsPageToDraft both resolve against the default", () => {
      const admin = source("lib/tryout-admin.ts");
      expect(admin).toContain("return resolveTryoutsPageContent(null)");
      expect(admin).toContain("return resolveTryoutsPageContent(row)");
    });

    it("Homepage Story tab: no placeholder props remain on the copy fields", () => {
      const homepage = source(HOMEPAGE_ADMIN);
      expect(homepage).not.toContain("placeholder={storyDefaults");
    });

    it("Homepage: the story draft resolves against the template default, per club name", () => {
      const content = source("lib/homepage-content.ts");
      expect(content).toContain("resolveHomepageStorySection(row, clubName)");
      expect(content).toContain("resolveHomepageStorySection(null, clubName)");
      const homepage = source(HOMEPAGE_ADMIN);
      expect(homepage).toContain("emptyHomepageStoryDraft(club.name)");
      expect(homepage).toContain("homepageStoryToDraft(");
    });

    it("Branding Footer tagline: no placeholder prop remains, and the load resolves the default", () => {
      const branding = source(BRANDING_ADMIN);
      expect(branding).not.toContain("placeholder={DEFAULT_ACADEMY_FOOTER_TAGLINE}");
      expect(branding).toContain("resolveFooterTagline(row?.footer_tagline)");
    });
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { diffSponsorLogos, type DraftSponsorLogo, type SponsorDraft } from "@/lib/sponsor-content";
import {
  canAddTo, diffRoseCitySponsors, draftFingerprint, draftsFromRows, inPlace, listedCount, moveWithinPlace,
  placesOverCap, rebaseDrafts, removeFromPlace, rowsFingerprint, setPlaceSwitch, websiteProblems, type Place,
} from "@/components/admin/sponsors/rose-city/rose-city-sponsors-model";

// RC-ADMIN-14: the Rose City Sponsors editor writes through diffRoseCitySponsors. These contracts pin it to the
// classic builder (diffSponsorLogos): any edit the classic page could make gives byte-identical writes.

const row = (id: string, order: number, home: boolean, footer: boolean, over: Partial<DBSiteSponsorLogo> = {}): DBSiteSponsorLogo => ({
  id, placement: "carousel", name: `Partner ${id}`, logo_url: `/${id}.png`, sort_order: order,
  show_on_homepage: home, show_in_footer: footer, website_url: null, created_at: "2026-11-01T00:00:00Z", ...over,
});
const LISTS: Record<string, DBSiteSponsorLogo[]> = {
  tight: [row("a", 0, true, true), row("b", 1, true, false), row("c", 2, false, true), row("d", 3, true, true), row("e", 4, true, false)],
  gappy: [row("a", 3, true, true), row("b", 9, true, false), row("c", 12, false, true), row("d", 40, true, true), row("e", 41, true, false)],
  withResting: [row("a", 0, true, true), row("r", 1, false, false), row("b", 2, true, false), row("c", 3, false, true)],
};
const json = (value: unknown) => JSON.stringify(value);
const asPlaceDraft = (drafts: readonly SponsorDraft[], place: Place): DraftSponsorLogo[] =>
  inPlace(drafts, place).map((d) => ({ id: d.id, name: d.name, logo_url: d.logo_url }));
const edit = (drafts: SponsorDraft[], key: string, over: Partial<SponsorDraft>) => drafts.map((d) => (d.key === key ? { ...d, ...over } : d));
const fresh = (key: string, name: string, place: Place, over: Partial<SponsorDraft> = {}): SponsorDraft =>
  ({ key, id: null, name, logo_url: `/${key}.png`, website: "", homepage: place === "carousel", footer: place === "footer", ...over });

describe("Rose City sponsors: untouched page", () => {
  for (const [name, rows] of Object.entries(LISTS)) {
    it(`sends nothing for an untouched ${name} list`, () => {
      const drafts = draftsFromRows(rows);
      expect(draftFingerprint(drafts)).toBe(draftFingerprint(draftsFromRows(rows)));
      expect(diffRoseCitySponsors(rows, drafts)).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
    });
  }
  it("keeps resting sponsors out of the draft and out of every write", () => {
    const rows = LISTS.withResting;
    const drafts = draftsFromRows(rows);
    expect(drafts.map((d) => d.id)).toEqual(["a", "b", "c"]);
    const diff = diffRoseCitySponsors(rows, removeFromPlace(drafts, "b", "carousel"));
    expect(diff.toDelete.map((r) => r.id)).toEqual(["b"]);
    expect(JSON.stringify(diff)).not.toContain('"r"');
  });
});

describe("Rose City sponsors: byte-identical to the classic builder for edits the classic page can make", () => {
  for (const [listName, rows] of Object.entries(LISTS)) {
    for (const place of ["carousel", "footer"] as const) {
      const base = draftsFromRows(rows);
      const first = inPlace(base, place)[0];
      const second = inPlace(base, place)[1];
      const cases: Record<string, SponsorDraft[]> = {
        rename: edit(base, first.key, { name: "Renamed" }),
        "blank name": edit(base, first.key, { name: "   " }),
        replace: edit(base, first.key, { logo_url: "/new.png" }),
        "move down": moveWithinPlace(base, first.key, place, 1),
        "move up": moveWithinPlace(base, second.key, place, -1),
        "remove first": removeFromPlace(base, first.key, place),
        "remove second": removeFromPlace(base, second.key, place),
        "add one": [...base, fresh("n1", "New logo", place)],
        "add two and remove one": [...removeFromPlace(base, first.key, place), fresh("n1", "One", place), fresh("n2", "", place)],
        "rename + move + add": [...moveWithinPlace(edit(base, second.key, { name: "Second" }), first.key, place, 1), fresh("n1", "New", place)],
      };
      for (const [caseName, drafts] of Object.entries(cases)) {
        it(`${listName} / ${place} / ${caseName}`, () => {
          expect(json(diffRoseCitySponsors(rows, drafts))).toBe(json(diffSponsorLogos(place, rows, asPlaceDraft(drafts, place))));
        });
      }
    }
  }

  it("two places in one save equal the two classic saves in turn when they touch different rows", () => {
    const rows = LISTS.tight;
    const base = draftsFromRows(rows);
    const drafts = edit(edit(base, "b", { name: "B2" }), "c", { logo_url: "/c2.png" });
    const mine = diffRoseCitySponsors(rows, drafts);
    const carousel = diffSponsorLogos("carousel", rows, asPlaceDraft(edit(base, "b", { name: "B2" }), "carousel"));
    const footer = diffSponsorLogos("footer", rows, asPlaceDraft(edit(base, "c", { logo_url: "/c2.png" }), "footer"));
    expect(mine.toUpdate).toEqual([...carousel.toUpdate, ...footer.toUpdate].sort((x, y) => (x.id < y.id ? -1 : 1)));
  });
});

describe("Rose City sponsors: the website", () => {
  it("writes website_url only for a changed website, normalized like the one-list page", () => {
    const rows = LISTS.tight;
    const diff = diffRoseCitySponsors(rows, edit(draftsFromRows(rows), "b", { website: "theirshop.com" }));
    expect(diff.toUpdate).toEqual([{ id: "b", changes: { website_url: "https://theirshop.com" } }]);
  });
  it("clears a website with null and leaves an unchanged one out", () => {
    const rows = [row("a", 0, true, false, { website_url: "https://a.example" }), row("b", 1, true, false, { website_url: "https://b.example" })];
    const diff = diffRoseCitySponsors(rows, edit(draftsFromRows(rows), "a", { website: "" }));
    expect(diff.toUpdate).toEqual([{ id: "a", changes: { website_url: null } }]);
  });
  it("sends no website key on a new logo without one, and one on a new logo with one", () => {
    const rows = LISTS.tight;
    const diff = diffRoseCitySponsors(rows, [...draftsFromRows(rows), fresh("n1", "N", "carousel"), fresh("n2", "M", "footer", { website: "m.example.com" })]);
    expect(Object.keys(diff.toInsert[0])).toEqual(["name", "logo_url", "sort_order", "show_on_homepage", "show_in_footer"]);
    expect(diff.toInsert[1].website_url).toBe("https://m.example.com");
  });
  it("flags only a website that was typed and is not an address", () => {
    const rows = [row("a", 0, true, false, { website_url: "legacy" })];
    const drafts = draftsFromRows(rows);
    expect(websiteProblems(rows, drafts)).toEqual([]);
    expect(websiteProblems(rows, edit(drafts, "a", { website: "not an address" }))).toHaveLength(1);
    expect(websiteProblems(rows, [...drafts, fresh("n", "N", "carousel", { website: "x" })])).toHaveLength(1);
  });
});

describe("Rose City sponsors: places and limits", () => {
  it("a second place's switch is written as its own update before the row's other changes", () => {
    const rows = LISTS.tight;
    const diff = diffRoseCitySponsors(rows, edit(edit(draftsFromRows(rows), "b", { footer: true }), "b", { name: "B2" }));
    expect(diff.toUpdate).toEqual([{ id: "b", changes: { show_in_footer: true } }, { id: "b", changes: { name: "B2" } }]);
  });
  it("removing a sponsor from its last place deletes it; from one of two, only switches that place off", () => {
    const rows = LISTS.tight;
    const drafts = draftsFromRows(rows);
    expect(diffRoseCitySponsors(rows, removeFromPlace(drafts, "a", "carousel")).toUpdate).toEqual([{ id: "a", changes: { show_on_homepage: false } }]);
    expect(diffRoseCitySponsors(rows, removeFromPlace(drafts, "b", "carousel")).toDelete.map((r) => r.id)).toEqual(["b"]);
  });
  it("holds the caps: 10 in the carousel, 6 in the footer, 30 listed", () => {
    const many = Array.from({ length: 10 }, (_, i) => row(`h${i}`, i, true, false));
    expect(canAddTo(many, draftsFromRows(many), "carousel")).toBe(false);
    expect(canAddTo(many, draftsFromRows(many), "footer")).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => row(`f${i}`, i, false, true));
    expect(canAddTo(six, draftsFromRows(six), "footer")).toBe(false);
    const resting = Array.from({ length: 29 }, (_, i) => row(`r${i}`, i, false, false));
    const list = [...resting, row("x", 29, true, false)];
    expect(listedCount(list, draftsFromRows(list))).toBe(30);
    expect(canAddTo(list, draftsFromRows(list), "carousel")).toBe(false);
    expect(placesOverCap(draftsFromRows(many).map((d) => ({ ...d, footer: true })))).toEqual(["footer"]);
  });
  it("switching a place on moves nothing else", () => {
    const drafts = draftsFromRows(LISTS.tight);
    expect(setPlaceSwitch(drafts, "b", "footer", true).map((d) => d.key)).toEqual(drafts.map((d) => d.key));
  });
});

describe("Rose City sponsors: conflict handling", () => {
  it("fingerprints every column the page writes", () => {
    const rows = LISTS.tight;
    expect(rowsFingerprint(rows)).toBe(rowsFingerprint(rows.map((r) => ({ ...r }))));
    expect(rowsFingerprint(rows)).not.toBe(rowsFingerprint(rows.map((r) => (r.id === "c" ? { ...r, website_url: "https://x.example" } : r))));
  });
  it("keeps my edits on the latest list: elsewhere-deleted rows leave, elsewhere-added rows join, my removals stay", () => {
    const before = LISTS.tight;
    const mine = removeFromPlace(edit(draftsFromRows(before), "b", { name: "B mine" }), "e", "carousel");
    const latest = [...before.filter((r) => r.id !== "c"), row("z", 5, true, false)];
    const next = rebaseDrafts(mine, before, latest);
    expect(next.map((d) => d.id)).toEqual(["a", "b", "d", "z"]);
    expect(next.find((d) => d.id === "b")?.name).toBe("B mine");
  });
});

describe("Rose City sponsors: the editor", () => {
  const source = readFileSync(resolve(process.cwd(), "components/admin/sponsors/rose-city/RoseCitySponsorsEditor.tsx"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "app/admin/(protected)/sponsors/page.tsx"), "utf8");
  it("saves through the classic persistence and storage-cleanup path", () => {
    expect(source).toContain("persistSponsorAttempt");
    expect(source).toContain("deleteUnusedSponsorStorageUrls");
    expect(source).toContain("diffRoseCitySponsors");
    expect(source).not.toMatch(/delete forever/i);
  });
  it("branches to it for the classic portal on cinematic@2 only, with one template read", () => {
    expect(page).toContain("RoseCitySponsorsEditor");
    expect(page.match(/presentationTemplateKey/g)).toHaveLength(1);
    expect(page).toMatch(/if \(club.presentationTemplateKey !== "cinematic@2"\) return page;\s*[^]*if \(portal === "classic"\) return <RoseCitySponsorsEditor \/>;/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { diffSponsorLogos, type DraftSponsorLogo, type SponsorDraft } from "@/lib/sponsor-content";
import {
  canAddTo, diffRoseCitySponsors, draftFingerprint, draftsFromRows, inPlace, listedCount, moveWithinPlace,
  placesOverCap, rebaseDrafts, removeFromPlace, rowsFingerprint, websiteProblems, applyReplace, retiredFiles, unsavedReplacedFile, type Place,
} from "@/components/admin/sponsors/rose-city/rose-city-sponsors-model";

// RC-ADMIN-14: the Rose City Sponsors editor shows the carousel only and writes through diffRoseCitySponsors.
// These contracts pin it to the classic builder (diffSponsorLogos) and prove the footer data is preserved.

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
const asPlaceDraft = (drafts: readonly SponsorDraft[]): DraftSponsorLogo[] =>
  inPlace(drafts, "carousel").map((d) => ({ id: d.id, name: d.name, logo_url: d.logo_url }));
const edit = (drafts: SponsorDraft[], key: string, over: Partial<SponsorDraft>) => drafts.map((d) => (d.key === key ? { ...d, ...over } : d));
const fresh = (key: string, name: string, over: Partial<SponsorDraft> = {}): SponsorDraft =>
  ({ key, id: null, name, logo_url: `/${key}.png`, website: "", homepage: true, footer: false, ...over });

describe("Rose City sponsors: untouched page", () => {
  for (const [name, rows] of Object.entries(LISTS)) {
    it(`sends nothing for an untouched ${name} list`, () => {
      const drafts = draftsFromRows(rows);
      expect(draftFingerprint(drafts)).toBe(draftFingerprint(draftsFromRows(rows)));
      expect(diffRoseCitySponsors(rows, drafts)).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
    });
  }
  it("keeps footer-only and resting sponsors out of the draft", () => {
    expect(draftsFromRows(LISTS.withResting).map((d) => d.id)).toEqual(["a", "b"]);
    expect(draftsFromRows(LISTS.tight).map((d) => d.id)).toEqual(["a", "b", "d", "e"]);
  });
});

describe("Rose City sponsors: byte-identical to the classic builder for carousel edits", () => {
  for (const [listName, rows] of Object.entries(LISTS)) {
    const base = draftsFromRows(rows);
    const first = base[0];
    const second = base[1];
    const cases: Record<string, SponsorDraft[]> = {
      rename: edit(base, first.key, { name: "Renamed" }),
      "blank name": edit(base, first.key, { name: "   " }),
      replace: edit(base, first.key, { logo_url: "/new.png" }),
      "move down": moveWithinPlace(base, first.key, "carousel", 1),
      "move up": moveWithinPlace(base, second.key, "carousel", -1),
      "remove first": removeFromPlace(base, first.key),
      "remove second": removeFromPlace(base, second.key),
      "add one": [...base, fresh("n1", "New logo")],
      "add two and remove one": [...removeFromPlace(base, first.key), fresh("n1", "One"), fresh("n2", "")],
      "rename + move + add": [...moveWithinPlace(edit(base, second.key, { name: "Second" }), first.key, "carousel", 1), fresh("n1", "New")],
    };
    for (const [caseName, drafts] of Object.entries(cases)) {
      it(`${listName} / ${caseName}`, () => {
        expect(json(diffRoseCitySponsors(rows, drafts))).toBe(json(diffSponsorLogos("carousel", rows, asPlaceDraft(drafts))));
      });
    }
  }
});

describe("Rose City sponsors: footer data is preserved", () => {
  const rows = [
    row("a", 0, true, true), row("f1", 1, false, true), row("b", 2, true, false), row("f2", 3, false, true),
    row("d", 4, true, true), row("r", 5, false, false), row("e", 6, true, false),
  ];
  const base = draftsFromRows(rows);
  const edits: Record<string, SponsorDraft[]> = {
    rename: edit(base, "a", { name: "Renamed" }),
    website: edit(base, "d", { website: "theirshop.com" }),
    replace: edit(base, "a", { logo_url: "/new.png" }),
    move: moveWithinPlace(base, "a", "carousel", 1),
    "remove a both-places row": removeFromPlace(base, "a"),
    "remove a carousel-only row": removeFromPlace(base, "b"),
    add: [...base, fresh("n1", "New", { website: "n.example.com" })],
    everything: [...removeFromPlace(moveWithinPlace(edit(edit(base, "a", { name: "A2" }), "d", { website: "d.example.com" }), "a", "carousel", 1), "e"), fresh("n1", "N")],
  };
  const footerFlags = new Set(["show_in_footer", "placement"]);
  for (const [name, drafts] of Object.entries(edits)) {
    it(`${name}: no write touches a footer flag, a footer-only row or a resting row`, () => {
      const diff = diffRoseCitySponsors(rows, drafts);
      const touched = [...diff.toUpdate.map((u) => u.id), ...diff.toDelete.map((r) => r.id)];
      for (const id of ["f1", "f2", "r"]) expect(touched).not.toContain(id);
      for (const update of diff.toUpdate) for (const key of Object.keys(update.changes)) expect(footerFlags.has(key)).toBe(false);
      // The only footer value ever sent is the false a new carousel logo carries, exactly as the classic builder sends it.
      for (const insert of diff.toInsert) expect(insert.show_in_footer).toBe(false);
      // A row still in the footer is never deleted; leaving the carousel only switches the carousel off.
      for (const removed of diff.toDelete) expect(removed.show_in_footer).toBe(false);
    });
  }
  it("a carousel row also in the footer keeps its row when removed: only show_on_homepage goes off", () => {
    expect(diffRoseCitySponsors(rows, removeFromPlace(base, "a")).toUpdate).toEqual([{ id: "a", changes: { show_on_homepage: false } }]);
  });
  it("footer-only rows count toward the 30 total", () => {
    const many = [...Array.from({ length: 29 }, (_, i) => row(`f${i}`, i, false, true)), row("x", 29, true, false)];
    expect(listedCount(many, draftsFromRows(many))).toBe(30);
    expect(canAddTo(many, draftsFromRows(many), "carousel")).toBe(false);
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
    const diff = diffRoseCitySponsors(rows, [...draftsFromRows(rows), fresh("n1", "N"), fresh("n2", "M", { website: "m.example.com" })]);
    expect(Object.keys(diff.toInsert[0])).toEqual(["name", "logo_url", "sort_order", "show_on_homepage", "show_in_footer"]);
    expect(diff.toInsert[1].website_url).toBe("https://m.example.com");
  });
  it("flags only a website that was typed and is not an address", () => {
    const rows = [row("a", 0, true, false, { website_url: "legacy" })];
    const drafts = draftsFromRows(rows);
    expect(websiteProblems(rows, drafts)).toEqual([]);
    expect(websiteProblems(rows, edit(drafts, "a", { website: "not an address" }))).toHaveLength(1);
    expect(websiteProblems(rows, [...drafts, fresh("n", "N", { website: "x" })])).toHaveLength(1);
  });
});

describe("Rose City sponsors: limits", () => {
  it("holds the caps: 10 in the carousel, 30 listed", () => {
    const many = Array.from({ length: 10 }, (_, i) => row(`h${i}`, i, true, false));
    expect(canAddTo(many, draftsFromRows(many), "carousel")).toBe(false);
    const resting = Array.from({ length: 29 }, (_, i) => row(`r${i}`, i, false, false));
    const list = [...resting, row("x", 29, true, false)];
    expect(listedCount(list, draftsFromRows(list))).toBe(30);
    expect(canAddTo(list, draftsFromRows(list), "carousel")).toBe(false);
    expect(placesOverCap([...draftsFromRows(many), fresh("z", "Z")])).toEqual(["carousel"]);
  });
});

describe("Rose City sponsors: conflict handling", () => {
  it("fingerprints every column the page writes", () => {
    const rows = LISTS.tight;
    expect(rowsFingerprint(rows)).toBe(rowsFingerprint(rows.map((r) => ({ ...r }))));
    expect(rowsFingerprint(rows)).not.toBe(rowsFingerprint(rows.map((r) => (r.id === "c" ? { ...r, website_url: "https://x.example" } : r))));
  });
  const before = LISTS.tight;
  const mine = (over: (d: SponsorDraft[]) => SponsorDraft[]) => over(draftsFromRows(before));
  const saveAfterKeep = (drafts: SponsorDraft[], latest: DBSiteSponsorLogo[]) => diffRoseCitySponsors(latest, rebaseDrafts(drafts, before, latest).drafts);
  it("a concurrent rename or website change on an untouched row survives keep-my-edits and Save", () => {
    const latest = before.map((r) => (r.id === "a" ? { ...r, name: "Renamed elsewhere" } : r.id === "d" ? { ...r, website_url: "https://d.example" } : r));
    const diff = saveAfterKeep(mine((d) => edit(d, "b", { name: "B mine" })), latest);
    expect(diff.toUpdate).toEqual([{ id: "b", changes: { name: "B mine" } }]);
    expect(diff.toDelete).toEqual([]);
    const kept = rebaseDrafts(mine((d) => d), before, latest).drafts;
    expect(kept.find((d) => d.id === "a")?.name).toBe("Renamed elsewhere");
    expect(kept.find((d) => d.id === "d")?.website).toBe("https://d.example");
  });
  it("my own edits still apply, and my removals stay removed", () => {
    const latest = [...before, row("z", 5, true, false)];
    const rebased = rebaseDrafts(mine((d) => removeFromPlace(edit(edit(d, "b", { name: "B mine" }), "d", { website: "d.example.com" }), "e")), before, latest);
    expect(rebased.drafts.map((d) => d.id)).toEqual(["a", "b", "d", "z"]);
    const diff = diffRoseCitySponsors(latest, rebased.drafts);
    expect(diff.toUpdate).toEqual([{ id: "b", changes: { name: "B mine" } }, { id: "d", changes: { website_url: "https://d.example.com" } }]);
    expect(diff.toDelete.map((r) => r.id)).toEqual(["e"]);
  });
  it("takes the order from the fresh list unless I reordered", () => {
    const latest = [before[1], before[0], ...before.slice(2)].map((r, i) => ({ ...r, sort_order: i }));
    expect(rebaseDrafts(mine((d) => edit(d, "d", { name: "D2" })), before, latest).drafts.map((d) => d.id)).toEqual(["b", "a", "d", "e"]);
    expect(rebaseDrafts(mine((d) => moveWithinPlace(d, "a", "carousel", 1)), before, latest).drafts.map((d) => d.id).slice(0, 2)).toEqual(["b", "a"]);
  });
  it("reports a row hidden or deleted elsewhere instead of dropping it silently", () => {
    const latest = before.filter((r) => r.id !== "d").map((r) => (r.id === "b" ? { ...r, show_on_homepage: false } : r));
    const rebased = rebaseDrafts(mine((d) => edit(d, "b", { name: "B mine" })), before, latest);
    expect(rebased.drafts.map((d) => d.id)).toEqual(["a", "e"]);
    expect(rebased.notes).toHaveLength(2);
    expect(rebased.notes[0]).toContain("B mine");
    expect(rebased.notes[0]).toContain("no longer shows");
    expect(rebased.notes[1]).toContain("deleted");
  });
  it("footer flags round-trip through the rebase: they come from the fresh rows and are never written", () => {
    const latest = before.map((r) => (r.id === "b" ? { ...r, show_in_footer: true } : r));
    const rebased = rebaseDrafts(mine((d) => edit(d, "a", { name: "A2" })), before, latest);
    expect(rebased.drafts.map((d) => d.footer)).toEqual(draftsFromRows(latest).map((d) => d.footer));
    const diff = diffRoseCitySponsors(latest, rebased.drafts);
    expect(JSON.stringify(diff)).not.toContain("show_in_footer");
  });
});

describe("Rose City sponsors: Replace logo", () => {
  const rows = [row("a", 0, true, false), row("b", 1, true, true)];
  it("keeps the new file on the sponsor, in the draft and in the save payload", () => {
    const drafts = applyReplace(draftsFromRows(rows), "a", "/new.png", "new")!;
    expect(drafts[0].logo_url).toBe("/new.png");
    expect(drafts[0].name).toBe("Partner a");
    const diff = diffRoseCitySponsors(rows, drafts);
    expect(diff.toUpdate).toEqual([{ id: "a", changes: { logo_url: "/new.png" } }]);
  });
  it("retires only the old file, never the new one", () => {
    const diff = diffRoseCitySponsors(rows, applyReplace(draftsFromRows(rows), "a", "/new.png", "new")!);
    expect(retiredFiles(rows, diff)).toEqual(["/a.png"]);
  });
  it("a blank name takes the file's name", () => {
    expect(applyReplace(edit(draftsFromRows(rows), "a", { name: " " }), "a", "/new.png", "new file")![0].name).toBe("new file");
  });
  it("returns null when the sponsor is gone, so the caller deletes the new upload", () => {
    expect(applyReplace(removeFromPlace(draftsFromRows(rows), "a"), "a", "/new.png", "new")).toBeNull();
  });
  it("cleans up the file of an unsaved replaced logo, and only that one", () => {
    expect(unsavedReplacedFile({ id: null, logo_url: "/upload.png" })).toBe("/upload.png");
    expect(unsavedReplacedFile({ id: "a", logo_url: "/a.png" })).toBeNull();
  });
  it("the editor reads the draft from a ref, never a flag set inside a state updater", () => {
    const source = readFileSync(resolve(process.cwd(), "components/admin/sponsors/rose-city/RoseCitySponsorsEditor.tsx"), "utf8");
    expect(source).not.toContain("stillThere");
    expect(source).toContain("draftsRef.current");
    expect(source).toContain("unsavedReplacedFile");
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

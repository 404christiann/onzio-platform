import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { diffSponsorLogos } from "@/lib/sponsor-content";
import {
  persistSponsorAttempt,
  reconcileSponsorDraft,
  type SponsorEditorLogo,
  type SponsorSaveAttempt,
} from "@/components/admin/sponsors/classic-sponsors-save";

const row = (id: string, name = id, url = `/${id}.png`, order = 0): DBSiteSponsorLogo => ({
  id, name, logo_url: url, sort_order: order, placement: "carousel",
  show_on_homepage: true, show_in_footer: false, website_url: null, created_at: "2026-11-01T00:00:00Z",
});
const draft = (id: string | null, key: string, name = key, url = `/${key}.png`): SponsorEditorLogo => ({ id, key, name, logo_url: url });
function attempt(original: DBSiteSponsorLogo[], logos: SponsorEditorLogo[]): SponsorSaveAttempt {
  return {
    placement: "carousel", version: 7, logos, originalIds: new Set(original.map((row) => row.id)),
    changes: diffSponsorLogos("carousel", original, logos), deleted: false, updates: 0,
    inserted: null, insertUncertain: false, retireUrls: ["/obsolete.png"], retired: false,
  };
}
type Result = { error: { message: string } | null; data?: unknown };
function writer(fresh: DBSiteSponsorLogo[]) {
  const writes: unknown[] = [];
  return {
    writes,
    async remove(ids: string[]): Promise<Result> { writes.push(["delete", ids]); return { error: null }; },
    async update(id: string, changes: unknown): Promise<Result> { writes.push(["update", id, changes]); return { error: null }; },
    async insert(rows: unknown): Promise<Result> { writes.push(["insert", rows]); return { error: null, data: fresh }; },
    async read() { return fresh; },
    async retire(urls: string[]) { writes.push(["retire", urls]); },
  };
}

describe("classic sponsor save commands", () => {
  it("keeps the original submitted changes across a partial update failure", async () => {
    const pending = attempt([row("a"), row("b", "b", "/b.png", 1), row("c", "c", "/c.png", 2)], [draft("a", "a", "A"), draft("b", "b", "B")]);
    const sink = writer([row("a", "A"), row("b", "B", "/b.png", 1)]);
    let fail = true;
    const update = sink.update;
    sink.update = async (id, changes) => {
      if (id === "b" && fail) { fail = false; sink.writes.push(["rejected", id, changes]); return { error: { message: "Try later" } }; }
      return update(id, changes);
    };
    await expect(persistSponsorAttempt(pending, sink)).rejects.toThrow("Try later");
    await expect(persistSponsorAttempt(pending, sink)).resolves.toEqual([row("a", "A"), row("b", "B", "/b.png", 1)]);
    expect(sink.writes).toEqual([
      ["delete", ["c"]], ["update", "a", { name: "A" }], ["rejected", "b", { name: "B" }],
      ["update", "b", { name: "B" }], ["retire", ["/obsolete.png"]],
    ]);
  });

  it("does not insert twice when the confirming refresh fails", async () => {
    const pending = attempt([], [draft(null, "upload", "Partner", "/upload.png")]);
    const fresh = [row("created", "Partner", "/upload.png")];
    const sink = writer(fresh);
    let fail = true;
    sink.read = async () => { if (fail) { fail = false; throw new Error("Read failed"); } return fresh; };
    await expect(persistSponsorAttempt(pending, sink)).rejects.toThrow("Read failed");
    await persistSponsorAttempt(pending, sink);
    expect(sink.writes.filter((write) => (write as unknown[])[0] === "insert")).toHaveLength(1);
    expect(reconcileSponsorDraft([draft(null, "upload", "New name", "/newer.png")], pending)).toEqual([draft("created", "upload", "New name", "/newer.png")]);
  });

  it("confirms a committed lost insert response before retrying", async () => {
    const pending = attempt([], [draft(null, "upload", "Partner", "/upload.png")]);
    const fresh = [row("created", "Partner", "/upload.png")];
    const sink = writer(fresh);
    sink.insert = async (rows) => { sink.writes.push(["insert", rows]); throw new Error("Response lost"); };
    await expect(persistSponsorAttempt(pending, sink)).rejects.toThrow("Response lost");
    await expect(persistSponsorAttempt(pending, sink)).resolves.toEqual(fresh);
    expect(sink.writes.filter((write) => (write as unknown[])[0] === "insert")).toHaveLength(1);
  });

  it("keeps an unconfirmed insert from being sent again or claimed saved", async () => {
    const pending = attempt([], [draft(null, "upload", "Partner", "/upload.png")]);
    const sink = writer([]);
    sink.insert = async (rows) => { sink.writes.push(["insert", rows]); throw new Error("Response lost"); };
    await expect(persistSponsorAttempt(pending, sink)).rejects.toThrow("Response lost");
    await expect(persistSponsorAttempt(pending, sink)).rejects.toThrow("previous save has not been confirmed");
    expect(sink.writes).toHaveLength(1);
  });

  it("retains newer names, replacements, order and new rows while assigning confirmed IDs", async () => {
    const pending = attempt([row("old")], [draft("old", "old"), draft(null, "created", "Partner", "/upload.png")]);
    await persistSponsorAttempt(pending, writer([row("old"), row("new-id", "Partner", "/upload.png", 1)]));
    const current = [draft(null, "fresh"), draft(null, "created", "New name", "/newer.png"), draft("old", "old", "Changed")];
    expect(reconcileSponsorDraft(current, pending)).toEqual([
      draft(null, "fresh"), draft("new-id", "created", "New name", "/newer.png"), draft("old", "old", "Changed"),
    ]);
  });

  it("retries failed retirement without repeating confirmed writes", async () => {
    const pending = attempt([row("old")], []);
    const sink = writer([]);
    let fail = true;
    sink.retire = async (urls) => { sink.writes.push(["retire", urls]); if (fail) { fail = false; throw new Error("Cleanup failed"); } };
    await expect(persistSponsorAttempt(pending, sink)).rejects.toThrow("Cleanup failed");
    await persistSponsorAttempt(pending, sink);
    expect(sink.writes).toEqual([["delete", ["old"]], ["retire", ["/obsolete.png"]], ["retire", ["/obsolete.png"]]]);
  });
  it("assigns distinct confirmed IDs when created keys share one image", async () => {
    const pending = attempt([], [draft(null, "first", "First", "/shared.png"), draft(null, "second", "Second", "/shared.png")]);
    await persistSponsorAttempt(pending, writer([row("confirmed-a", "First", "/shared.png", 0), row("confirmed-b", "Second", "/shared.png", 1)]));
    expect(reconcileSponsorDraft(pending.logos, pending).map((logo) => logo.id)).toEqual(["confirmed-a", "confirmed-b"]);
  });

});

describe("classic sponsor logo tiles", () => {
  const source = readFileSync(resolve(process.cwd(), "components/admin/sponsors/ClassicSponsorsPage.tsx"), "utf8");
  const tile = source.match(/<div\s+data-sponsor-logo-tile[\s\S]*?className="([^"]+)"/)?.[1] ?? "";
  const ground = tile.match(/\bbg-\[(#[0-9a-fA-F]{6})\]/)?.[1];

  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("sets logos on a fixed neutral ground, not the theme background", () => {
    expect(tile).not.toBe("");
    expect(tile).not.toMatch(/\bbg-(background|card|white|black)\b/);
    expect(ground).toBeDefined();
  });

  it("keeps both white and black logos visible on that ground (graphics need 3:1)", () => {
    expect(contrast(ground!, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrast(ground!, "#000000")).toBeGreaterThanOrEqual(3);
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_INJURY_ENTRIES,
  cinematicInjuryReportContentSchema,
  injuryVideoLink,
  starterCinematicInjuryReportContent,
  type CinematicInjuryReportContent,
} from "@/lib/cinematic-injury-report-content";

const entry = (overrides: Partial<CinematicInjuryReportContent["entries"][number]> = {}) => ({
  id: randomUUID(), playerId: randomUUID(), injury: "Hamstring strain", timeline: "2–3 weeks", note: "", ...overrides,
});
const withEntries = (entries: CinematicInjuryReportContent["entries"]): CinematicInjuryReportContent => ({ ...starterCinematicInjuryReportContent(), entries });
const errors = (value: unknown) => {
  const result = cinematicInjuryReportContentSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
};

describe("cinematic Injury Report content rules", () => {
  it("starts an unseeded club with Sam's headings, no logo, no photo, no video and no invented injuries", () => {
    const starter = starterCinematicInjuryReportContent();
    expect(starter.page.presenterName).toBe("MVMNT CULTR");
    expect(starter.page.rehabHeading).toBe("Rehab with MVMNT CULTR");
    expect(starter.page.quote).toBe("");
    expect(starter.page.videoUrl).toBe("");
    expect(starter.presenterLogoAssetId).toBeNull();
    expect(starter.bandAssetId).toBeNull();
    expect(starter.entries).toEqual([]);
    expect(errors(starter)).toEqual([]);
  });

  it("keeps the owner's entry order with injury, timeline and an optional note", () => {
    const content = withEntries([entry({ injury: "Ankle sprain", timeline: "Day-to-day", note: "Assessed before the next match." }), entry()]);
    const parsed = cinematicInjuryReportContentSchema.parse(content);
    expect(parsed.entries.map(row => row.injury)).toEqual(["Ankle sprain", "Hamstring strain"]);
    expect(parsed.entries[0].note).toBe("Assessed before the next match.");
  });

  it("requires an injury and a timeline and limits every text field", () => {
    expect(errors(withEntries([entry({ injury: " " })]))).toEqual(["entries.0.injury: Enter the injury."]);
    expect(errors(withEntries([entry({ timeline: "" })]))).toEqual(["entries.0.timeline: Enter the timeline."]);
    expect(errors(withEntries([entry({ injury: "x".repeat(81) })]))).not.toEqual([]);
    expect(errors(withEntries([entry({ timeline: "x".repeat(41) })]))).not.toEqual([]);
    expect(errors(withEntries([entry({ note: "x".repeat(200) })]))).toEqual([]);
    expect(errors(withEntries([entry({ note: "x".repeat(201) })]))).not.toEqual([]);
    const page = starterCinematicInjuryReportContent().page;
    for (const [field, max] of [["presenterName", 60], ["rehabHeading", 80], ["quote", 600], ["quoteAttribution", 120], ["bandAlt", 200]] as const) {
      expect(errors({ ...starterCinematicInjuryReportContent(), page: { ...page, [field]: "x".repeat(max) } })).toEqual([]);
      expect(errors({ ...starterCinematicInjuryReportContent(), page: { ...page, [field]: "x".repeat(max + 1) } })).not.toEqual([]);
    }
  });

  it("needs the partner name and the Rehab heading, since the page always shows them", () => {
    const page = starterCinematicInjuryReportContent().page;
    expect(errors({ ...starterCinematicInjuryReportContent(), page: { ...page, presenterName: "" } })).toEqual(["page.presenterName: Enter the partner's name."]);
    expect(errors({ ...starterCinematicInjuryReportContent(), page: { ...page, rehabHeading: "  " } })).toEqual(["page.rehabHeading: Enter a heading."]);
  });

  it(`allows at most ${MAX_INJURY_ENTRIES} entries, each player once, each entry id once`, () => {
    expect(errors(withEntries(Array.from({ length: MAX_INJURY_ENTRIES }, () => entry())))).toEqual([]);
    expect(errors(withEntries(Array.from({ length: MAX_INJURY_ENTRIES + 1 }, () => entry())))).not.toEqual([]);
    const player = randomUUID();
    expect(errors(withEntries([entry({ playerId: player }), entry({ playerId: player })]))).toEqual(["entries.1.playerId: This player already has an entry."]);
    const id = randomUUID();
    expect(errors(withEntries([entry({ id }), entry({ id })]))).toEqual(["entries.1.id: Duplicate entry."]);
  });

  it("stores only the canonical YouTube embed link, or nothing", () => {
    const page = starterCinematicInjuryReportContent().page;
    const content = (videoUrl: string) => ({ ...starterCinematicInjuryReportContent(), page: { ...page, videoUrl } });
    expect(errors(content("https://www.youtube.com/embed/fJf_A4LdKDw?rel=0"))).toEqual([]);
    expect(errors(content(""))).toEqual([]);
    expect(errors(content("https://youtu.be/fJf_A4LdKDw"))).toEqual(["page.videoUrl: Paste a YouTube video link."]);
    expect(errors(content("https://vimeo.com/123"))).toEqual(["page.videoUrl: Paste a YouTube video link."]);
  });

  it("turns a pasted watch, youtu.be or live link into the stored embed link", () => {
    expect(injuryVideoLink("https://www.youtube.com/watch?v=fJf_A4LdKDw&t=30")).toBe("https://www.youtube.com/embed/fJf_A4LdKDw?rel=0");
    expect(injuryVideoLink(" https://youtu.be/fJf_A4LdKDw ")).toBe("https://www.youtube.com/embed/fJf_A4LdKDw?rel=0");
    expect(injuryVideoLink("")).toBe("");
    expect(injuryVideoLink("http://youtu.be/fJf_A4LdKDw")).toBeNull();
    expect(injuryVideoLink("https://example.com/watch?v=fJf_A4LdKDw")).toBeNull();
  });

  it("rejects unknown fields and malformed media ids", () => {
    expect(errors({ ...starterCinematicInjuryReportContent(), extra: true })).not.toEqual([]);
    expect(errors({ ...starterCinematicInjuryReportContent(), bandAssetId: "not-a-uuid" })).not.toEqual([]);
    expect(errors(withEntries([{ ...entry(), position: "Defender" } as never]))).not.toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { cinematicPolicyContentSchema, starterCinematicPolicyContent, type CinematicPolicyContent } from "@/lib/cinematic-policies-content";

const accessibility = {
  id: "accessibility", heading: "Accessibility", blocks: [
    { kind: "subheading", text: "Parking" },
    { kind: "paragraph", text: "ADA parking is located within Robinson Stadium. Those wishing to park within accessible locations must present a valid ADA placard while parked." },
    { kind: "subheading", text: "Seating" },
    { kind: "paragraph", text: "Accessible seating options are available throughout all areas and price levels of Robinson Stadium." },
  ],
};
const sam = {
  title: "Stadium Guidelines", subtitle: "& FAQ’s", heading: "Guidelines",
  rows: [accessibility,
    { id: "animals", heading: "Animals", blocks: [{ kind: "paragraph", text: "Robinson Stadium has a no-pet policy." }] },
    { id: "bags", heading: "Bags & Backpacks", blocks: [] }],
};
const content = { guidelines: sam, fanCode: { ...sam, title: "Fan Code of Conduct", heading: "Code of Conduct" } };
const withGuidelines = (change: Partial<typeof sam>) => ({ ...content, guidelines: { ...sam, ...change } });
const valid = (value: unknown) => cinematicPolicyContentSchema.safeParse(value).success;

describe("cinematic policy page content rules", () => {
  it("accepts Sam's pages: subheadings with paragraphs, a one-paragraph answer and a row still waiting for its answer", () => {
    const parsed: CinematicPolicyContent = cinematicPolicyContentSchema.parse(content);
    expect(parsed.guidelines.rows.map(row => row.blocks.length)).toEqual([4, 1, 0]);
    expect(parsed.fanCode.title).toBe("Fan Code of Conduct");
  });
  it("requires a page title and a heading on every row, but lets the red line and section heading be blank", () => {
    expect(valid(withGuidelines({ title: "  " }))).toBe(false);
    expect(valid(withGuidelines({ rows: [{ ...accessibility, heading: " " }] }))).toBe(false);
    expect(valid(withGuidelines({ subtitle: "", heading: "" }))).toBe(true);
  });
  it("caps a page at 30 rows and an answer at 12 subheadings or paragraphs", () => {
    const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, heading: `Row ${i}`, blocks: [] }));
    expect(valid(withGuidelines({ rows: rows(30) }))).toBe(true);
    expect(valid(withGuidelines({ rows: rows(31) }))).toBe(false);
    const lines = (count: number) => Array.from({ length: count }, () => ({ kind: "paragraph", text: "Line" }));
    expect(valid(withGuidelines({ rows: [{ ...accessibility, blocks: lines(12) }] }))).toBe(true);
    expect(valid(withGuidelines({ rows: [{ ...accessibility, blocks: lines(13) }] }))).toBe(false);
  });
  it("rejects blank answer lines, unknown line kinds, repeated row ids, extra keys and a missing page", () => {
    expect(valid(withGuidelines({ rows: [{ ...accessibility, blocks: [{ kind: "paragraph", text: " " }] }] }))).toBe(false);
    expect(valid(withGuidelines({ rows: [{ ...accessibility, blocks: [{ kind: "html", text: "<b>x</b>" }] }] }))).toBe(false);
    expect(valid(withGuidelines({ rows: [accessibility, { ...accessibility, heading: "Again" }] }))).toBe(false);
    expect(valid({ ...content, news: sam })).toBe(false);
    expect(valid({ guidelines: sam })).toBe(false);
    expect(valid({ ...content, guidelines: { ...sam, rows: [{ ...accessibility, open: true }] } })).toBe(false);
  });
  it("starts an unseeded club with both titles and headings and no rows", () => {
    const starter = cinematicPolicyContentSchema.parse(starterCinematicPolicyContent());
    expect([starter.guidelines.title, starter.guidelines.heading, starter.fanCode.title, starter.fanCode.heading])
      .toEqual(["Stadium Guidelines", "Guidelines", "Fan Code of Conduct", "Code of Conduct"]);
    expect(starter.guidelines.rows).toEqual([]);
  });
});

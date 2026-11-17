import { describe, expect, it } from "vitest";
import { academyProofDocuments } from "../../scripts/pilot-academy-documents";
import { accepted53Commit, codeSiteParityInputSchema, compareFocusedCodeSiteSnapshots, focusedCodeSiteDocuments, selectFocusedCodeSiteDocuments,
  type FocusedCodeSiteSnapshot } from "../../scripts/code-site-parity-contract";

const parameters = {
  programSlug: "proof-academy-program", formSlug: "proof-academy-registration",
  playerId: "11111111-1111-4111-8111-111111111111", fixtureId: "22222222-2222-4222-8222-222222222222",
  confirmationToken: "a".repeat(43),
};

function snapshot(): FocusedCodeSiteSnapshot {
  return { id: "public.home", width: 1440, screenshotSha256: "a".repeat(64), text: "Academy proof home",
    links: [["Programs", "/programs"]], headings: [{ text: "Academy proof home", font: "Inter", color: "rgb(0, 0, 0)", size: "40px" }],
    controls: [{ text: "Shop page", role: null, current: "page", pressed: null, disabled: false }], browserReads: { "GET /rest/v1/programs": 1 },
    redirects: [], fonts: ["b".repeat(64)], css: ["c".repeat(64)], images: { "/images/logo/rosecityLogo.png": "d".repeat(64) } };
}

describe("focused code site parity contract", () => {
  it("selects the fixed populated public and editor surfaces once each", () => {
    const selected = selectFocusedCodeSiteDocuments(academyProofDocuments(parameters));
    expect(selected.map(item => item.id)).toEqual([...focusedCodeSiteDocuments]);
    expect(selected).toHaveLength(8);
    expect(() => selectFocusedCodeSiteDocuments(selected.slice(1))).toThrow("public.home");
    expect(() => selectFocusedCodeSiteDocuments([...selected, selected[0]])).toThrow("public.home");
  });

  it("requires exact accepted53 and a distinct full final source identity", () => {
    const input = { roots: { before: "/tmp/accepted53", after: "/tmp/final56" }, beforeCommit: accepted53Commit, afterCommit: "f".repeat(40) };
    expect(codeSiteParityInputSchema.parse(input)).toEqual(input);
    expect(() => codeSiteParityInputSchema.parse({ ...input, beforeCommit: "fee1c5b" })).toThrow();
    expect(() => codeSiteParityInputSchema.parse({ ...input, afterCommit: accepted53Commit })).toThrow();
  });

  it("compares request counts independently of arrival order", () => {
    const before = snapshot(), after = snapshot();
    before.browserReads = { "GET /rest/v1/programs": 2, "GET /rest/v1/matches": 1 };
    after.browserReads = { "GET /rest/v1/matches": 1, "GET /rest/v1/programs": 2 };
    expect(compareFocusedCodeSiteSnapshots(before, after)).toEqual([]);
  });

  it("reports every changed visible or behavioral field without tolerances", () => {
    const before = snapshot(), after = snapshot();
    expect(compareFocusedCodeSiteSnapshots(before, after)).toEqual([]);
    after.screenshotSha256 = "e".repeat(64);
    after.links = [["Programs", "/other"]];
    after.browserReads = { "GET /rest/v1/programs": 2 };
    expect(compareFocusedCodeSiteSnapshots(before, after)).toEqual(["screenshotSha256", "links", "browserReads"]);
    after.fonts = [];
    expect(() => compareFocusedCodeSiteSnapshots(before, after)).toThrow("Both builds must load fonts");
  });
});

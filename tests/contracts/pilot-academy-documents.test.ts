import { describe, expect, it } from "vitest";
import { academyProofDocuments, academyProofDocumentPath, assertAcademyProofCoverage } from "../../scripts/pilot-academy-documents";

const parameters = { programSlug: "proof-program", formSlug: "proof-registration",
  playerId: "11111111-1111-4111-8111-111111111111", fixtureId: "22222222-2222-4222-8222-222222222222", confirmationToken: "a".repeat(43) };

describe("finite complete Academy proof documents", () => {
  it("resolves all seventeen public routes and only mounted preview cases", () => {
    const cases = academyProofDocuments(parameters);
    expect(cases.filter(item => item.document.kind === "public").map(item => item.id)).toEqual([
      "public.home", "public.about", "public.logo", "public.contact", "public.programs", "public.programDetail",
      "public.register", "public.registerConfirmation", "public.roster", "public.rosterPlayer", "public.schedule",
      "public.scheduleFixture", "public.shop", "public.sponsors", "public.staff", "public.stats", "public.tryouts",
    ]);
    expect(cases.some(item => item.id === "preview.brandingFooter")).toBe(true);
    expect(cases.some(item => ["preview.logo", "preview.roster", "preview.schedule", "preview.sponsorsFooter"].includes(item.id))).toBe(false);
    expect(academyProofDocumentPath({ kind: "public", route: "programDetail" }, parameters)).toBe("/programs/proof-program");
    expect(academyProofDocumentPath({ kind: "public", route: "registerConfirmation" }, parameters)).toBe(`/register/proof-registration/confirmation?token=${"a".repeat(43)}`);
    expect(() => assertAcademyProofCoverage(cases.map(item => item.id))).not.toThrow();
  });
  it.each(["../escape", "https://host.invalid", "valid?other=1", "valid/extra", "valid%2fextra"])("rejects fixture path injection %s", value => {
    expect(() => academyProofDocuments({ ...parameters, programSlug: value })).toThrow();
  });
  it("rejects extra caller paths and parameters rather than fetching them", () => {
    expect(() => academyProofDocumentPath({ kind: "public", route: "home", path: "https://host.invalid" } as never, parameters)).toThrow();
    expect(() => academyProofDocuments({ ...parameters, origin: "https://host.invalid" } as never)).toThrow();
  });
  it("rejects missing, duplicate and foreign capture cases", () => {
    const ids = academyProofDocuments(parameters).map(item => item.id);
    expect(() => assertAcademyProofCoverage(ids.slice(1))).toThrow("INCOMPLETE_ACADEMY_PROOF_COVERAGE");
    expect(() => assertAcademyProofCoverage([...ids.slice(1), ids[1]])).toThrow("INCOMPLETE_ACADEMY_PROOF_COVERAGE");
    expect(() => assertAcademyProofCoverage([...ids.slice(1), "public.foreign"])).toThrow("INCOMPLETE_ACADEMY_PROOF_COVERAGE");
  });
});

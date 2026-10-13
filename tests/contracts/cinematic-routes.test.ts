import { describe, expect, it } from "vitest";
import { cinematicPlaceholderLabelId, CINEMATIC_PLACEHOLDER_ROUTES } from "@/lib/cinematic-routes";
import { templateRegistry, routeRegistry, fontPacks } from "@/packages/presentation";

describe("cinematic2 isolated destinations", () => {
  it("keeps every new destination registered and scoped to version2", () => {
    for (const [path, id] of Object.entries(CINEMATIC_PLACEHOLDER_ROUTES)) {
      expect(cinematicPlaceholderLabelId("cinematic@2", path)).toBe(id);
      expect(Object.values(routeRegistry).some(route => route.path === path)).toBe(true);
      for (const key of [null, "cinematic@1", "academy@1", "editorial@1", "heritage@1"]) expect(cinematicPlaceholderLabelId(key, path)).toBeNull();
    }
    expect(cinematicPlaceholderLabelId("cinematic@2", "/unregistered")).toBeNull();
    expect(cinematicPlaceholderLabelId("cinematic@2", "/stadium/../../admin")).toBeNull();
  });
  it("retains legacy cinematic registrations while version2 owns its font and content", () => {
    expect(templateRegistry["cinematic@1"].defaultFontPack).toBe("bebas-inter");
    expect(templateRegistry["cinematic@1"].supportedRoutes).not.toContain("tickets");
    expect(templateRegistry["cinematic@2"].defaultFontPack).toBe("museomoderno-avenir");
    expect(fontPacks["museomoderno-avenir"].compatibleTemplates).toEqual(["cinematic@2"]);
    expect(templateRegistry["cinematic@2"].defaultSections).toContain("cinematic.matchday");
  });
});

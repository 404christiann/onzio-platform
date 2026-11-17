import { describe, expect, it } from "vitest";
import { cinematicPlaceholderLabelId, CINEMATIC_PLACEHOLDER_ROUTES } from "@/lib/cinematic-routes";
import { activeTemplateRegistration, fontPacks, isActiveTemplateKey, routeRegistry, sectionRegistry, templateRegistry } from "@/packages/presentation";

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
  it("retires legacy cinematic@1 while version2 owns its font, content and destinations", () => {
    expect(isActiveTemplateKey("cinematic@1")).toBe(false);
    expect(activeTemplateRegistration("cinematic@1")).toBeNull();
    expect(templateRegistry["cinematic@2"].supportedRoutes).toContain("tickets");
    expect(fontPacks["museomoderno-avenir"].compatibleTemplates).toEqual(["cinematic@2"]);
    expect(fontPacks["bebas-inter"].compatibleTemplates).not.toContain("cinematic@2");
    expect(sectionRegistry["cinematic.matchday"].compatibleTemplates).toEqual(["cinematic@2"]);
  });
});

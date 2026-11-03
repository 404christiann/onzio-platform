import { describe, expect, it } from "vitest";
import { aboutDestinationOptions, loadAboutDestinationOptions } from "../about-editor/destinations";

describe("About closing button destinations", () => {
  it("offers only published supported routes and omits an unavailable Shop", () => {
    expect(aboutDestinationOptions(
      ["home", "club", "roster", "store", "tryouts", "club", "/whatever"],
      "clubhouse@1",
      false,
    )).toEqual([
      { href: "/", label: "Home" },
      { href: "/club/about", label: "About" },
      { href: "/roster", label: "Roster" },
    ]);
  });

  it("offers Academy Tryouts when the active site serves that route", () => {
    expect(aboutDestinationOptions(
      ["home", "club", "tryouts", "contact"],
      "academy@1",
      true,
    )).toEqual([
      { href: "/", label: "Home" },
      { href: "/club/about", label: "About" },
      { href: "/tryouts", label: "Tryouts" },
      { href: "/contact", label: "Contact" },
    ]);
  });

  it("keeps legacy Rose City routes available without a presentation document", async () => {
    const options = aboutDestinationOptions(["home", "club", "tryouts"], null, true);
    expect(options).toEqual([
      { href: "/", label: "Home" },
      { href: "/club/about", label: "About" },
    ]);

    const supabase = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof loadAboutDestinationOptions>[0];
    const legacyOptions = await loadAboutDestinationOptions(supabase, {
      id: "rose-city",
      presentationTemplateKey: null,
      storeEnabled: true,
    });
    expect(legacyOptions).toContainEqual({ href: "/", label: "Home" });
    expect(legacyOptions).toContainEqual({ href: "/club/about", label: "About" });
    expect(legacyOptions.some((option) => option.href === "/club/about")).toBe(true);
  });
});

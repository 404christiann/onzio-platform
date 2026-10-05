import { describe, expect, it } from "vitest";
import { aboutDestinationOptions } from "../about-editor/destinations";

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

  it("preserves editorial's existing About destination and valid Tryouts page", () => {
    expect(aboutDestinationOptions(
      ["home", "club", "tryouts", "contact"],
      "editorial@1",
      true,
    )).toEqual([
      { href: "/", label: "Home" },
      { href: "/club/about", label: "About" },
      { href: "/tryouts", label: "Tryouts" },
      { href: "/contact", label: "Contact" },
    ]);
  });

  it("does not offer Heritage's advertised Tryouts route while its tenant page returns 404", () => {
    expect(aboutDestinationOptions(
      ["home", "tryouts", "club"],
      "heritage@1",
      true,
    )).toEqual([
      { href: "/", label: "Home" },
      { href: "/club/about", label: "About" },
    ]);
  });
});

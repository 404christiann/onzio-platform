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

  it("does not infer a retired template for an unassigned club", () => {
    expect(aboutDestinationOptions(["home", "club", "tryouts"], null, true)).toEqual([]);
  });
});

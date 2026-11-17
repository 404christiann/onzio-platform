import { describe, expect, it } from "vitest";
import { isAboutContentDestination } from "@/lib/about-editor/content-policy";

describe("About content destination vocabulary", () => {
  it.each(["/", "/roster", "/schedule", "/club/about", "/club/logo", "/shop", "/sponsors", "/staff", "/standings", "/stats", "/tryouts", "/programs", "/contact"])("accepts exact historical destination %s", href => {
    expect(isAboutContentDestination(href)).toBe(true);
  });
  it.each([null, undefined, 1, false, {}, [], ["/contact"], Object("/contact"), "", "https://evil.test", "//evil.test", "/admin", "/contact?x=1", "/contact#x", "/contact/", "/%63ontact", "/Contact", " /contact", "/contact\n", "/club/../contact", "/programs/new"])("rejects unknown and noncanonical input %j", href => {
    expect(isAboutContentDestination(href)).toBe(false);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TemplateFontScope from "@/components/TemplateFontScope";
import { codeSiteFor } from "@/lib/code-site";

describe("legacy code-site dispatch", () => {
  it("maps every trusted Academy template context to the same code site", () => {
    for (const slug of ["diverse-city", "alpha", "another-club"]) {
      const club = { slug, presentationTemplateKey: "academy@1" as const };
      expect(codeSiteFor(club)).toBe("diverse-city");
    }
    expect(codeSiteFor({ presentationTemplateKey: "cinematic@1" })).toBeNull();
    expect(codeSiteFor({ presentationTemplateKey: "heritage@1" })).toBeNull();
    expect(codeSiteFor({ presentationTemplateKey: "clubhouse@1" })).toBeNull();
    expect(codeSiteFor({ presentationTemplateKey: "editorial@1" })).toBeNull();
    expect(codeSiteFor({ presentationTemplateKey: null })).toBeNull();
  });

  it("keeps the Academy font pack scoped to that code site", () => {
    const render = (presentationTemplateKey: "academy@1" | "clubhouse@1" | null) =>
      renderToStaticMarkup(createElement(TemplateFontScope, {
        templateKey: presentationTemplateKey,
        children: createElement("span", null, "Content"),
      }));

    expect(render("academy@1")).toContain('data-font-pack="academy"');
    expect(render("academy@1")).toContain('class="contents"');
    expect(render("clubhouse@1")).not.toContain("data-font-pack");
    expect(render(null)).not.toContain("data-font-pack");
  });
});

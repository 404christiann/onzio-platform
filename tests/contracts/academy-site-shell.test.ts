import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import AcademyShell from "@/components/sites/diverse-city/Shell";
import { HomepagePreviewContext, type HomepagePreviewValue } from "@/lib/homepage-editor/preview-context";
import type { ClubContext } from "@/lib/club-context";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next/navigation", () => ({ usePathname: () => "/club/about" }));

const club: ClubContext = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "alpha",
  name: "Alpha FC",
  primaryDomain: "alpha.localhost",
  lifecycle: "active",
  publicAccess: "live",
  kind: "test",
  stripePriceId: null,
  tier: "pro",
  role: null,
  primaryColor: null,
  secondaryColor: null,
  presentationTemplateKey: "academy@1",
  storeEnabled: true,
};
const branding = { logoPath: "/crest.webp", inverseLogoPath: "", footerTagline: "Club first" };
const footerGuard = "html:has([data-academy-page-loading]) footer { display: none; }";

function render(preview: Partial<HomepagePreviewValue> | null) {
  const page: ReactNode = createElement("p", { id: "page-content" }, "Page content");
  const shell = createElement(AcademyShell, { children: page });
  const inner = preview === null
    ? shell
    : createElement(HomepagePreviewContext.Provider, { value: { draft: {}, videoSource: "", selection: null, allowedPieces: [], select: () => {}, ...preview } as HomepagePreviewValue, children: shell });
  return renderToStaticMarkup(
    createElement(ClubContextProvider, {
      club,
      children: createElement(ClubBrandingProvider, { initialBranding: branding, children: inner }),
    }),
  );
}

describe("the Academy shell shared by public pages and the editor preview", () => {
  it("frames a public page with the header, footer and loading-time footer guard", () => {
    const html = render(null);
    expect(html).toContain('data-font-pack="academy"');
    expect(html).toContain("<header");
    expect(html).toContain('<main><p id="page-content">Page content</p></main>');
    expect(html).toContain("<footer");
    expect(html).toContain(footerGuard);
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main>"));
    expect(html.indexOf("<main>")).toBeLessThan(html.indexOf("<footer"));
  });

  it("shows only the font-scoped page while the editor is selecting pieces", () => {
    const html = render({ playback: false });
    expect(html).toContain('data-font-pack="academy"');
    expect(html).toContain('<main><p id="page-content">Page content</p></main>');
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain(footerGuard);
  });

  it("adds the header and footer, but not the public loading guard, in playback", () => {
    const html = render({ playback: true });
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    expect(html).toContain('<main><p id="page-content">Page content</p></main>');
    expect(html).not.toContain(footerGuard);
  });

  it("is the frame both callers render, with no second preview implementation", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    expect(read("app/%5Fclubs/[slug]/layout.tsx")).toContain("<AcademyShell>{children}</AcademyShell>");
    expect(read("components/admin/homepage/HomepageEditor.tsx")).toContain("<AcademyShell>{preview}</AcademyShell>");
  });
});

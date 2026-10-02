import { describe, expect, it } from "vitest";
import { DEFAULT_ABOUT_PAGE_CONTENT, DEFAULT_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { prepareAboutPageSave } from "../about-editor/save";

const NOW = "2026-10-02T12:00:00.000Z";

describe("About public page save scope", () => {
  it("builds only the selected About row and pins Academy's destination", () => {
    const prepared = prepareAboutPageSave({
      page: "about",
      about: { ...DEFAULT_ABOUT_PAGE_CONTENT, hero_title: "  Our club  ", closing_cta_href: "/wrong" },
      logo: { ...DEFAULT_CLUB_LOGO_PAGE_CONTENT, annotated_image_url: "unsaved-logo.png" },
      academy: true,
      now: NOW,
    });

    expect(prepared.page).toBe("about");
    expect(prepared.content).toMatchObject({ hero_title: "Our club", closing_cta_href: "/schedule", updated_at: NOW });
    expect(prepared.content).not.toHaveProperty("annotated_image_url");
  });

  it("builds only the selected Club Logo row, leaving About changes out", () => {
    const prepared = prepareAboutPageSave({
      page: "logo",
      about: { ...DEFAULT_ABOUT_PAGE_CONTENT, hero_title: "Unsaved About" },
      logo: { ...DEFAULT_CLUB_LOGO_PAGE_CONTENT, map_image_url: "new-map.png" },
      academy: false,
      now: NOW,
    });

    expect(prepared.page).toBe("logo");
    expect(prepared.content).toMatchObject({ map_image_url: "new-map.png", updated_at: NOW });
    expect(prepared.content).not.toHaveProperty("hero_title");
  });
});

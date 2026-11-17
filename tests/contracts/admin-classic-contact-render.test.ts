import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AcademyContactPage from "@/components/sites/diverse-city/AcademyContactPage";
import type { ContactContent } from "@/lib/queries";

vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const populated: ContactContent = {
  profile: { publicEmail: "contact@example.org", publicPhone: "+1 312 555 0199", serviceArea: "Chicago", hours: "Monday to Friday" },
  page: { eyebrow: "Contact", headline: "Start a conversation", intro: "Talk to the club.", heroMediaUrl: "http://127.0.0.1:54321/storage/v1/object/public/club-media/hero-version.webp" },
  socialLinks: [{ id: "instagram", label: "Instagram", href: "https://instagram.com/example", icon: "/instagram.svg", sort_order: 0, updated_at: "2026-11-15T00:00:00Z" }],
};

// Captured from the frozen prerequisite before adding the optional callback.
const frozen = { populated: "2c858f64dd708256985285a1239b7bcaa3f6655242dd7c2941680eb09c557c4c", empty: "b89b026ca8cc96d780a0300c8b2459c43c2617b79f763e9637371838ebd928bb" };

describe("Classic Contact public rendering seam", () => {
  it.each([{ name: "populated", content: populated }, { name: "empty", content: { profile: null, page: null, socialLinks: [] } }])("preserves frozen default $name output", ({ name, content }) => {
    const html = renderToStaticMarkup(createElement(AcademyContactPage, { content, clubName: "Alpha FC" }));
    expect(createHash("sha256").update(html).digest("hex")).toBe(frozen[name as keyof typeof frozen]);
    expect(html).not.toContain("data-admin-editable-region");
    expect(html).not.toContain("Add contact details to show this section.");
    expect(html).not.toContain("No social links yet.");
    if (content.page) expect(html).toContain(content.page.heroMediaUrl);
    else expect(html).toContain("Contact details coming soon");
  });

  it("lets only the supplied editor callback create empty regions", () => {
    const html = renderToStaticMarkup(createElement(AcademyContactPage, {
      content: { profile: null, page: null, socialLinks: [] },
      renderEditorRegion: (section, children) => createElement("div", { "data-test-editor-region": section }, children ?? `Empty ${section}`),
    }));
    expect(html.match(/data-test-editor-region=/g)).toHaveLength(3);
    expect(html).toContain("Empty details"); expect(html).toContain("Empty social");
    expect(html).toContain("Start a conversation");
  });
});

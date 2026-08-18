import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("pathway Senior Club interest section", () => {
  it("keeps every word tenant-owned through the neutral content API", () => {
    const component = read(
      "components/pathway/PathwaySeniorInterest.tsx",
    );

    expect(component).not.toContain('"use client"');
    expect(component).toContain("export type PathwaySeniorInterestProps");
    for (const prop of [
      "heading: string;",
      "intro: string;",
      "formEyebrow: string;",
      "formHeading: string;",
      "formIntro: string;",
      "submitLabel: string;",
      "successMessage: string;",
    ]) {
      expect(component).toContain(prop);
    }
    expect(component).not.toContain("eyebrow: string;");
    expect(component).not.toContain("eyebrow={eyebrow}");
    expect(component).toContain(
      '<header className="pathway-section-head" data-align="center">',
    );
    expect(component).toContain(
      '<h1 className="pathway-section-heading">{heading}</h1>',
    );
    expect(component).toContain(
      '<p className="pathway-section-intro">{intro}</p>',
    );
    expect(component).not.toContain("Coming soon!");
    expect(component).not.toContain("Want to be part of it?");
    expect(component).not.toContain("Manu Ledesma Academy");
    expect(component).not.toContain("manu-ledesma-academy");
  });

  it("composes the existing secure form instead of duplicating submission behavior", () => {
    const component = read(
      "components/pathway/PathwaySeniorInterest.tsx",
    );

    expect(component).toContain(
      'import PathwayContactForm from "@/components/pathway/PathwayContactForm"',
    );
    expect(component).toContain("<PathwayContactForm");
    expect(component).toContain("heading={formHeading}");
    expect(component).toContain("submitLabel={submitLabel}");
    expect(component).toContain("successMessage={successMessage}");
    expect(component).toContain("fallbackEmail={fallbackEmail}");
    expect(component).not.toContain("<form");
    expect(component).not.toContain("fetch(");
    expect(component).not.toMatch(/clubId|club_id|tenantId|tenant_id/);
  });

  it("collects optional phone through the same honeypot-protected form", () => {
    const form = read("components/pathway/PathwayContactForm.tsx");

    expect(form).toContain('phone: String(data.get("phone") ?? "")');
    expect(form).toContain('name="phone"');
    expect(form).toContain('type="tel"');
    expect(form).toContain('autoComplete="tel"');
    expect(form).toContain('inputMode="tel"');
    expect(form).toContain("maxLength={50}");
    expect(form.match(/<span>\(required\)<\/span>/g)).toHaveLength(4);
    expect(form).not.toMatch(/name="phone"[\s\S]{0,180}\brequired\b/);
    expect(form).toContain("[CONTACT_HONEYPOT_FIELD]: String(");
    expect(form).not.toMatch(/clubId|club_id|tenantId|tenant_id/);
  });
});

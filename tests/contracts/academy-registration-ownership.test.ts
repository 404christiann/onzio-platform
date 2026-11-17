import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Academy registration ownership", () => {
  it("keeps the Academy registration slideshow in the site module used by the shared detail page", () => {
    const path = "components/sites/diverse-city/AcademyProgramRegistrationSlideshow.tsx";
    expect(source(path)).toContain("export default function AcademyProgramRegistrationSlideshow");
    expect(existsSync(resolve(process.cwd(), "components/AcademyProgramRegistrationSlideshow.tsx"))).toBe(false);
    expect(source("components/sites/diverse-city/AcademyProgramDetailPage.tsx")).toContain(`@/${path.replace(/\.tsx$/, "")}`);
    expect(source("components/admin/ScaledProgramPreview.tsx")).toContain("@/components/sites/diverse-city/AcademyProgramDetailPage");
    expect(source("app/%5Fclubs/[slug]/programs/[programSlug]/page.tsx")).toContain("@/components/sites/diverse-city/AcademyProgramDetailPage");
  });

  it("gives Academy meaningful page composition while reusing shared transaction components", () => {
    const form = source("components/sites/diverse-city/AcademyRegistrationPage.tsx");
    const confirmation = source("components/sites/diverse-city/AcademyRegistrationConfirmationPage.tsx");
    expect(form).toContain("export default function AcademyRegistrationPage");
    expect(form).toContain("<section");
    expect(form).toContain("@/components/registration/RegistrationCtaButton");
    expect(confirmation).toContain("export default function AcademyRegistrationConfirmationPage");
    expect(confirmation).toContain("<section");
    expect(confirmation).toContain("useRegistrationConfirmation(token)");
    for (const component of [form, confirmation]) {
      expect(component).not.toContain("presentationTemplateKey");
      expect(component).not.toContain("/api/register");
      expect(component).not.toContain("getStripeClient");
    }
  });

  it.each([
    "components/registration/RegisterModal.tsx",
    "components/registration/RegistrationCtaButton.tsx",
    "components/registration/RegistrationConfirmation.tsx",
    "components/registration/SignatureInput.tsx",
  ])("keeps the shared registration surface independent of an Academy renderer: %s", (path) => {
    expect(source(path)).not.toContain("components/sites/diverse-city");
  });
});

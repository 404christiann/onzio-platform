import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Academy site page ownership", () => {
  it.each([
    {
      page: "Contact",
      modulePath: "components/sites/diverse-city/AcademyContactPage.tsx",
      duplicatePath: "components/AcademyContactPage.tsx",
      surfaces: [
        "app/(public)/contact/page.tsx",
        "app/%5Fclubs/[slug]/contact/page.tsx",
        "components/admin/contact/ContactPageCanvas.tsx",
        "components/admin/ScaledContactPreview.tsx",
      ],
    },
    {
      page: "Tryouts",
      modulePath: "components/sites/diverse-city/AcademyTryoutsPage.tsx",
      duplicatePath: "components/AcademyTryoutsPage.tsx",
      surfaces: [
        "app/(public)/tryouts/page.tsx",
        "app/%5Fclubs/[slug]/tryouts/page.tsx",
        "components/admin/ScaledTryoutsPreview.tsx",
      ],
    },
    {
      page: "Programs list",
      modulePath: "components/sites/diverse-city/AcademyProgramsPage.tsx",
      duplicatePath: "components/AcademyProgramsPage.tsx",
      surfaces: [
        "app/(public)/programs/page.tsx",
        "app/%5Fclubs/[slug]/programs/page.tsx",
        "app/admin/(protected)/programs/page.tsx",
      ],
    },
    {
      page: "Program detail",
      modulePath: "components/sites/diverse-city/AcademyProgramDetailPage.tsx",
      duplicatePath: "components/AcademyProgramDetailPage.tsx",
      surfaces: [
        "app/%5Fclubs/[slug]/programs/[programSlug]/page.tsx",
        "app/admin/(protected)/programs/page.tsx",
        "components/admin/ScaledProgramPreview.tsx",
      ],
    },
  ])(
    "uses the shared site-module $page component on public and preview surfaces",
    ({ modulePath, duplicatePath, surfaces }) => {
      expect(existsSync(resolve(root, modulePath))).toBe(true);
      expect(existsSync(resolve(root, duplicatePath))).toBe(false);
      const importedPath = modulePath
        .replace("components", "@/components")
        .replace(/\.tsx$/, "");
      for (const path of surfaces) {
        expect(source(path), path).toContain(importedPath);
      }
    },
  );
});

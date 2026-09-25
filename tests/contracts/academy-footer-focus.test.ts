import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("academy loading footer focus", () => {
  it("keeps the footer out of the tab order while a page loader is present", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "app/%5Fclubs/[slug]/layout.tsx"),
      "utf8",
    );
    const academyShell = layout.slice(
      layout.indexOf("async function AcademyResolvedShell"),
      layout.indexOf("export default async function TenantLayout"),
    );

    expect(academyShell).toContain("<Nav />");
    expect(academyShell).toContain("<Footer />");
    expect(academyShell).toContain(
      "html:has([data-academy-page-loading]) footer { visibility: hidden; }",
    );
  });
});

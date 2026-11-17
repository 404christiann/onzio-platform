import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("academy loading footer focus", () => {
  it("keeps the footer out of the tab order while a page loader is present", () => {
    const academyShell = readFileSync(
      resolve(process.cwd(), "components/sites/diverse-city/Shell.tsx"),
      "utf8",
    );

    expect(academyShell).toContain("<Nav />");
    expect(academyShell).toContain("<Footer />");
    expect(academyShell).toContain(
      "html:has([data-academy-page-loading]) footer { display: none; }",
    );
  });
});

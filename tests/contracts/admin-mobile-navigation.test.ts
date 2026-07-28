import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/AdminShell.tsx"),
  "utf8",
);

describe("admin mobile navigation", () => {
  it("constrains the drawer to the dynamic viewport", () => {
    expect(source).toContain("h-screen h-[100dvh]");
    expect(source).toContain("max-h-screen max-h-[100dvh]");
    expect(source).toContain("lg:h-auto");
  });

  it("lets the link region shrink and scroll with touch momentum", () => {
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
    expect(source).toContain('WebkitOverflowScrolling: "touch"');
  });

  it("locks background scrolling and exposes the drawer relationship", () => {
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('aria-controls="admin-sidebar"');
    expect(source).toContain('aria-label="Admin navigation"');
  });
});

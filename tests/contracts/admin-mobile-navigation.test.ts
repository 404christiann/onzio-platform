import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/AdminShell.tsx"),
  "utf8",
);
const globalStyles = readFileSync(
  resolve(process.cwd(), "styles/globals.css"),
  "utf8",
);

describe("admin mobile navigation", () => {
  it("constrains the drawer to the dynamic viewport", () => {
    expect(source).toContain("h-screen h-[100dvh]");
    expect(source).toContain("max-h-screen max-h-[100dvh]");
    expect(source).toContain("overflow-hidden");
    expect(source).toContain("lg:sticky lg:top-0");
    expect(source).toContain("lg:h-screen lg:h-[100dvh]");
    expect(source).toContain("lg:max-h-screen lg:max-h-[100dvh]");
    expect(source).toContain("lg:self-start");
  });

  it("lets the link region shrink and scroll with touch momentum", () => {
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain('WebkitOverflowScrolling: "touch"');
  });

  it("uses a slim translucent scrollbar that belongs to the dark sidebar", () => {
    expect(source).toContain("admin-nav-scrollbar");
    expect(globalStyles).toContain(".admin-nav-scrollbar");
    expect(globalStyles).toContain("scrollbar-color: rgba(255, 255, 255, 0.2) transparent");
    expect(globalStyles).toContain(".admin-nav-scrollbar::-webkit-scrollbar-track");
    expect(globalStyles).toContain("background: transparent");
    expect(globalStyles).toContain("width: 6px");
  });

  it("locks background scrolling and exposes the drawer relationship", () => {
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('aria-controls="admin-sidebar"');
    expect(source).toContain('aria-label="Admin navigation"');
  });
});

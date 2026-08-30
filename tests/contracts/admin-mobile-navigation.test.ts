import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/AdminShell.tsx"),
  "utf8",
);
// The viewport-clamp classes live in the reusable Sidebar primitive
// (components/ui/sidebar.tsx) rather than AdminShell.tsx directly, since
// AdminShell composes it instead of hand-rolling the <aside> markup.
const sidebarPrimitiveSource = readFileSync(
  resolve(process.cwd(), "components/ui/sidebar.tsx"),
  "utf8",
);
const globalStyles = readFileSync(
  resolve(process.cwd(), "styles/globals.css"),
  "utf8",
);

describe("admin mobile navigation", () => {
  it("constrains the drawer to the dynamic viewport", () => {
    expect(sidebarPrimitiveSource).toContain("h-screen h-[100dvh]");
    expect(sidebarPrimitiveSource).toContain("max-h-screen max-h-[100dvh]");
    expect(sidebarPrimitiveSource).toContain("overflow-hidden");
    expect(sidebarPrimitiveSource).toContain("lg:sticky lg:top-0");
    expect(sidebarPrimitiveSource).toContain("lg:h-screen lg:h-[100dvh]");
    expect(sidebarPrimitiveSource).toContain("lg:max-h-screen lg:max-h-[100dvh]");
    expect(sidebarPrimitiveSource).toContain("lg:self-start");
  });

  it("lets the link region shrink and scroll with touch momentum", () => {
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain('WebkitOverflowScrolling: "touch"');
  });

  it("uses a slim translucent scrollbar that adapts to both admin themes", () => {
    expect(source).toContain("admin-nav-scrollbar");
    expect(globalStyles).toContain(".admin-nav-scrollbar");
    expect(globalStyles).toContain("scrollbar-color: hsl(var(--foreground) / 0.2) transparent");
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

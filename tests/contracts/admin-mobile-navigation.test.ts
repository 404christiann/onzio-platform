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

// ADMIN-RE-24: the reimagined admin has no drawer. On a phone its tabs are a
// bottom bar; from 760px they are a sidebar.
describe("reimagined admin tabs on a phone and a laptop", () => {
  const shell = readFileSync(resolve(process.cwd(), "components/admin/reimagined/ReimaginedShell.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "components/admin/reimagined/frame.module.css"), "utf8");
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("pins the tab bar to the bottom, clear of the home indicator, and keeps content above it", () => {
    expect(rule(".tabBar")).toContain("position: fixed;");
    expect(rule(".tabBar")).toContain("bottom: 0;");
    expect(rule(".tabBar")).toContain("var(--admin-safe-area-bottom");
    expect(rule(".main")).toContain("var(--frame-tabbar)");
    expect(rule(".barLink")).toContain("min-height: 48px;");
  });

  it("swaps the tab bar for a sticky full-height sidebar from 760px", () => {
    const laptop = css.slice(css.indexOf("@media (min-width: 760px)"));
    expect(laptop).toMatch(/\.top,\s*\.tabBar \{\s*display: none;/);
    expect(laptop).toMatch(/\.side \{[^}]*position: sticky;[^}]*height: 100dvh;/);
  });

  it("hovers only with a fine pointer and drops the press scale for reduced motion", () => {
    expect(css).toContain("@media (hover: hover) and (pointer: fine)");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.press:active \{\s*transform: none;/);
    expect(rule(".press:active")).toContain("transform: scale(0.97);");
  });

  it("labels both tab lists the same, since only one shows at a time", () => {
    expect(shell.match(/<nav aria-label="Club admin"/g)).toHaveLength(2);
    expect(shell).not.toContain("document.body.style.overflow");
  });
});

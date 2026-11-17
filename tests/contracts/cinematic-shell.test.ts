import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CinematicHomepageContent } from "@/lib/cinematic-homepage-content";

const { observeProvider } = vi.hoisted(() => ({ observeProvider: vi.fn() }));
vi.mock("@/components/cinematic/CinematicContent", () => ({
  CinematicContentProvider: (props: { children: React.ReactNode; initialContent: unknown }) => { observeProvider(props.initialContent); return createElement(Fragment, null, props.children); },
}));
vi.mock("@/components/cinematic/CinematicNav", () => ({ default: () => createElement("header", null, "Navigation") }));
vi.mock("@/components/cinematic/CinematicFooter", () => ({ default: () => createElement("footer", null, "Footer") }));
vi.mock("@/components/cinematic/CinematicAvenirFonts", () => ({ default: () => createElement("style", { "data-test-avenir-fonts": "" }) }));
import CinematicShell from "@/components/cinematic/CinematicShell";

describe("cinematic shell integration", () => {
  it("provides the real header/footer in both public and editor modes", () => {
    for (const editing of [true, false]) {
      const html = renderToStaticMarkup(createElement(CinematicShell, { editing, children: createElement("p", null, "Homepage") }));
      expect((html.match(/<header/g) ?? []).length).toBe(1);
      expect((html.match(/<footer/g) ?? []).length).toBe(1);
      expect((html.match(/<main/g) ?? []).length).toBe(1);
    }
  });
  it("font-scope composition preserves caller chrome without adding a second shell", () => {
    const html = renderToStaticMarkup(createElement(CinematicShell, { contentOnly: true, children: createElement(Fragment, null,
      createElement("header", null, "Caller navigation"), createElement("main", null, "Caller content"), createElement("footer", null, "Caller footer")) }));
    expect((html.match(/<header/g) ?? []).length).toBe(1);
    expect((html.match(/<footer/g) ?? []).length).toBe(1);
    expect((html.match(/<main/g) ?? []).length).toBe(1);
    expect(html).toContain('class="cinematic-site"');
    expect(html).not.toContain('id="cinematic-main"');
  });
  it("renders the Avenir font faces once in every mode, including content-only previews", () => {
    for (const props of [{ editing: false }, { editing: true }, { contentOnly: true }]) {
      const shellProps = { ...props, children: "Content" };
      const html = renderToStaticMarkup(createElement(CinematicShell, shellProps));
      expect((html.match(/data-test-avenir-fonts/g) ?? []).length).toBe(1);
      expect(html.indexOf("data-test-avenir-fonts")).toBeGreaterThan(html.indexOf('class="cinematic-site"'));
    }
  });
  it("passes trusted server content into the shared provider", () => {
    const content = { navigation: { labels: { home: "Club home" } } } as unknown as CinematicHomepageContent;
    renderToStaticMarkup(createElement(CinematicShell, { initialContent: content, children: "Content" }));
    expect(observeProvider).toHaveBeenLastCalledWith(content);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChevronDown, Handshake } from "lucide-react";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";

// The repository keeps Next's JSX-preserve setting. Compile only these real
// components for SSR without changing the shared Vitest or application config.
const compiled = buildSync({
  stdin: { contents: 'export { NativeSelect } from "./components/ui/native-select"; export { IconCaretDown, IconDashboard, IconSponsors } from "./components/admin/icons";', resolveDir: process.cwd() },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  packages: "external",
  jsx: "automatic",
}).outputFiles[0].text;
const compiledModule = { exports: {} as Record<string, Parameters<typeof createElement>[0]> };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), compiledModule, compiledModule.exports);
const { NativeSelect, IconCaretDown, IconDashboard, IconSponsors } = compiledModule.exports;

const render = (component: Parameters<typeof createElement>[0], props = {}) =>
  renderToStaticMarkup(createElement(component, props));

describe("admin icon consumer isolation", () => {
  it.each([false, true])("preserves the shared native-select current drawing when disabled=%s", (disabled) => {
    const markup = render(NativeSelect, { disabled, "aria-label": "Season" });
    expect(markup).toContain(render(ChevronDown, {
      "aria-hidden": "true",
      "data-slot": "native-select-icon",
      className: "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
    }));
    expect(markup).toContain('aria-label="Season"');
    expect(markup).not.toContain("chevronIcon");
  });

  it("injects the approved admin drawing without changing select state or labels", () => {
    const markup = render(NativeSelect, { chevronIcon: IconCaretDown, disabled: true, "aria-label": "Season" });
    expect(markup).toContain('fill="currentColor"');
    expect(markup).toContain('data-slot="native-select-icon"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Season"');
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).not.toContain("chevronIcon");
  });

  it("preserves the explicitly kept Sponsors drawing exactly", () => {
    const props = { size: 24, className: "text-foreground", "aria-hidden": true };
    expect(render(IconSponsors, props)).toBe(render(Handshake, props));
  });

  it("inherits theme color and accepts consumer sizing without exposing decorative glyphs", () => {
    const markup = render(IconDashboard, { width: 16, height: 16, className: "text-muted-foreground" });
    expect(markup).toContain('width="16" height="16"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('fill="currentColor"');
    expect(markup).not.toContain('fill="black"');
  });
});

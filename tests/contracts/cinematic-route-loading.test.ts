import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// RC-CLS: the shared route fallback is shorter than the cinematic pages, so the footer showed under it and jumped
// when the page streamed in. Inside the cinematic shell the fallback fills the viewport; other templates keep 60svh.
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("cinematic route loading fallback", () => {
  it("marks the shared fallback so the cinematic shell can size it", () => {
    expect(source("components/TenantPageLoading.tsx")).toMatch(/className="tenant-page-loading [^"]*min-h-\[60svh\]/);
  });

  it("fills the viewport only inside the cinematic shell", () => {
    const css = source("components/cinematic/route-loading.css").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(css).toBe(".cinematic-site .tenant-page-loading{min-height:100svh}");
    expect(source("components/cinematic/CinematicShell.tsx")).toContain('import "./route-loading.css";');
  });

  it("keeps one shared fallback file for every tenant route", () => {
    expect(source("app/%5Fclubs/[slug]/loading.tsx")).toContain("<TenantPageLoading />");
  });
});

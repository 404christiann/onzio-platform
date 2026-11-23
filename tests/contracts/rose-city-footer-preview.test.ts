import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { twMerge } from "tailwind-merge";
import {
  FOOTER_PREVIEW_HEIGHT, FOOTER_PREVIEW_VIEWPORT, fitFooterPreview,
} from "@/components/admin/club-settings/rose-city/RoseCityFooterPreview";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const css = read("components/cinematic/cinematic.css");
const preview = read("components/admin/club-settings/rose-city/RoseCityFooterPreview.tsx");
const branding = read("components/admin/club-settings/rose-city/RoseCityBranding.tsx");
/** The public desktop rule for one footer image, in vw. */
const desktopVw = (selector: string) => Number(css.match(new RegExp(`\\.cinematic-site ${selector}\\{width:([\\d.]+)vw`))![1]);

// UI-FIX-LOGO-FOOTER-PREVIEW: the "Edit branding" footer preview used to render the footer outside `.cinematic-site`,
// so none of its sizes applied and the logo and social icons drew at their natural size.
describe("Rose City branding footer preview", () => {
  it("renders the public footer itself inside .cinematic-site, with no sizes of its own", () => {
    expect(branding).toContain("<RoseCityFooterPreview loading={cinematic.loading}>");
    expect(branding).toContain("<Footer overrides={preview} />");
    expect(preview).toContain('import "@/components/cinematic/cinematic.css"');
    expect(preview).toContain('className="cinematic-site"');
    // Restating a footer size here is how the preview would drift from the site.
    expect(preview).not.toMatch(/footer-logo|footer-brand|socials/);
  });

  it("lays the footer out at a 1440px viewport, so the logo is exactly the public desktop size before scaling", () => {
    expect(FOOTER_PREVIEW_VIEWPORT).toBe(1440);
    expect(desktopVw("\\.footer-logo>img")).toBe(5.8);
    expect(desktopVw("\\.footer-brand>img")).toBe(5.5);
    // 5.8vw at 1440px: the RCFC footer logo is 83.52px wide on a 1440px screen and in the preview's frame.
    expect((desktopVw("\\.footer-logo>img") / 100) * FOOTER_PREVIEW_VIEWPORT).toBeCloseTo(83.52, 2);
  });

  it("keeps public proportions for a normal footer and pins the logo under the frame height for a tall one", () => {
    const boxWidth = 378; // the dialog's preview column at a 1280px window
    const normal = fitFooterPreview(boxWidth, 263);
    expect(normal.scale).toBeCloseTo(boxWidth / FOOTER_PREVIEW_VIEWPORT, 6);
    expect(normal.boxHeight).toBeCloseTo((boxWidth * FOOTER_PREVIEW_HEIGHT) / FOOTER_PREVIEW_VIEWPORT, 6);
    // A 400x1600 logo at 5.8vw is 334px tall, so the footer grows past 500px; it shrinks to fit rather than overflow.
    for (const footerHeight of [520, 1200, 4000]) {
      const tall = fitFooterPreview(boxWidth, footerHeight);
      expect(footerHeight * tall.scale).toBeLessThanOrEqual(tall.boxHeight + 1e-9);
      expect(tall.x).toBeGreaterThan(0);
    }
    // The frame's height never depends on the logo, so nothing in the dialog moves while it loads.
    expect(fitFooterPreview(boxWidth, 263).boxHeight).toBe(fitFooterPreview(boxWidth, 4000).boxHeight);
  });

  it("keeps the desktop sidebar's top edge through tailwind-merge", () => {
    const sidebar = read("components/ui/sidebar.tsx");
    const classes = sidebar.match(/"bg-sidebar text-sidebar-foreground[^"]*"/)![0].slice(1, -1);
    expect(twMerge(classes).split(" ")).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-0", "lg:self-start"]));
  });
});

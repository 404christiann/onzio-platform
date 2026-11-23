import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_CLUB_LOGO_PAGE_CONTENT, type ClubLogoFeature } from "@/lib/about-content";
import { logoContentSchema } from "@/lib/about-editor/contract";
import { newLogoFeature } from "@/lib/about-editor/collections";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ name: "Synthetic Club", presentationTemplateKey: "cinematic@2" }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ fallbackVariant: _fallbackVariant, ...props }: Record<string, unknown>) => createElement("img", props) }));
import CinematicCrest from "@/components/cinematic/CinematicCrest";
import {
  CREST_PREVIEW_CROP, CREST_PREVIEW_VIEWPORT, ICON_SCALE_RANGE, ICON_SIZE_RANGE, crestPreviewContent, formatIconScale, formatIconSize,
} from "@/components/admin/about/rose-city/CrestIconSizing";
import { snapToStep, valueAtFraction, valueForKey } from "@/components/admin/ui/editor-kit/RangeSlider";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const feature = (i: number, sizing: Partial<ClubLogoFeature> = {}): ClubLogoFeature => ({
  title: `Feature ${i}`, description: `Meaning ${i}`, patch_url: `/images/patch-${i}.png`, icon_url: `/images/icon-${i}.png`, icon_size: 68, icon_scale: 1, ...sizing,
});
/** The style attribute of each feature's icon box, in page order. */
const iconStyles = (html: string) => Array.from(html.matchAll(/<div class="feature-icon" style="([^"]*)"/g), match => match[1]);

// UI-SLIDERS-ICON-SIZE-SCALE: the dialog's page preview is a 300px frame, where crest.css's phone rule replaces
// --crest-icon-size with a fixed width, so icon size never showed there. Each feature now has its own preview: the
// public page laid out at a desktop width, through the public component, with the sliders' values.
describe("crest icon preview and public page", () => {
  const sizes = [ICON_SIZE_RANGE.min, 50, ICON_SIZE_RANGE.defaultValue, 99, ICON_SIZE_RANGE.max];
  const scales = [ICON_SCALE_RANGE.min, 0.75, ICON_SCALE_RANGE.defaultValue, 2.25, ICON_SCALE_RANGE.max];

  it.each(sizes.flatMap(size => scales.map(scale => [size, scale] as const)))("size %d × scale %d sizes the icon exactly as the public page", (size, scale) => {
    const features = [feature(0), feature(1, { icon_size: 90, icon_scale: 1.45 }), feature(2)];
    const index = 1;
    // The public page with the value saved…
    const saved = features.map((item, at) => at === index ? { ...item, icon_size: size, icon_scale: scale } : item);
    const publicHtml = renderToStaticMarkup(createElement(CinematicCrest, { content: { ...EMPTY_CLUB_LOGO_PAGE_CONTENT, features: saved } }));
    // …and the preview while the sliders sit at that value (the draft still holds the old one).
    const previewHtml = renderToStaticMarkup(createElement(CinematicCrest, { content: crestPreviewContent(features, index, { icon_size: size, icon_scale: scale }) }));
    expect(iconStyles(previewHtml)).toEqual(iconStyles(publicHtml));
    expect(iconStyles(previewHtml)[index]).toBe(`--crest-icon-size:${size}px;--crest-icon-scale:${scale}`);
    // The other cards are the page's own.
    expect(iconStyles(previewHtml)[0]).toBe("--crest-icon-size:68px;--crest-icon-scale:1");
  });

  it("keeps editor-only card ids out of the content it renders", () => {
    const keyed = [{ ...feature(0), _id: "card-1" }];
    expect(crestPreviewContent(keyed, 0, { icon_size: 40, icon_scale: 2 }).features[0]).not.toHaveProperty("_id");
  });

  it("lays the page out at a desktop width, where crest.css sizes the icon from icon_size", () => {
    const css = read("components/cinematic/crest.css");
    const desktop = css.match(/@media \(min-width:(\d+)px\)\{([\s\S]*?)\n\}/)!;
    expect(CREST_PREVIEW_VIEWPORT).toBeGreaterThanOrEqual(Number(desktop[1]));
    expect(desktop[2]).toContain(".cinematic-site .feature-icon{width:calc(var(--crest-icon-size,68px)*.8)");
    // Below 600px (the dialog's own page preview is ~300px wide) the icon box has a fixed width: icon_size has no effect.
    const phone = css.match(/@media\(max-width:600px\)\{([\s\S]*?)\n\}/)![1];
    expect(phone).toMatch(/\.cinematic-site \.feature-icon\{width:var\(--mobile-icon\)/);
    expect(css).toContain("transform:scale(var(--crest-icon-scale,1))");
    // A desktop card (two columns inside 1280px with 5.4% padding: ~551px) fits the crop with page around it.
    expect(CREST_PREVIEW_CROP.width).toBeGreaterThan((1280 - 2 * 0.054 * CREST_PREVIEW_VIEWPORT - 22) / 2);
  });

  it("restates no icon sizing in the admin: the preview renders the public component", () => {
    const source = read("components/admin/about/rose-city/CrestIconSizing.tsx");
    expect(source).toContain("<CinematicCrest content={crestPreviewContent(features, index, sizing)} />");
    expect(source).not.toMatch(/feature-icon|--crest-icon|\*\s*0?\.8\b/);
  });
});

describe("icon size and scale ranges", () => {
  it("are the saved ranges and defaults the save contract and the database accept", () => {
    expect([ICON_SIZE_RANGE.min, ICON_SIZE_RANGE.max, ICON_SIZE_RANGE.defaultValue]).toEqual([24, 140, newLogoFeature().icon_size]);
    expect([ICON_SCALE_RANGE.min, ICON_SCALE_RANGE.max, ICON_SCALE_RANGE.defaultValue]).toEqual([0.5, 4, newLogoFeature().icon_scale]);
    const { id: _id, updated_at: _updated, ...base } = EMPTY_CLUB_LOGO_PAGE_CONTENT;
    const parse = (icon_size: number, icon_scale: number) => logoContentSchema.safeParse({ ...base, features: [{ ...feature(0), icon_size, icon_scale }] }).success;
    expect(parse(ICON_SIZE_RANGE.min, ICON_SCALE_RANGE.min)).toBe(true);
    expect(parse(ICON_SIZE_RANGE.max, ICON_SCALE_RANGE.max)).toBe(true);
    expect(parse(ICON_SIZE_RANGE.min - 1, 1)).toBe(false);
    expect(parse(ICON_SIZE_RANGE.max + 1, 1)).toBe(false);
    expect(parse(70, ICON_SCALE_RANGE.min - 0.01)).toBe(false);
    expect(parse(70, ICON_SCALE_RANGE.max + 0.01)).toBe(false);
    expect(read("supabase/migrations/20261022200815_about_content_policy.sql"))
      .toContain("(item->>'icon_size')::numeric not between 24 and 140 or (item->>'icon_scale')::numeric not between 0.5 and 4");
  });

  it("shows real units with fixed decimals", () => {
    expect(formatIconSize(48)).toBe("48 px");
    expect(formatIconScale(1.25)).toBe("1.25×");
    expect(formatIconScale(1)).toBe("1.00×");
  });
});

describe("slider stepping", () => {
  it("snaps to clean steps inside the range, without floating-point tails", () => {
    expect(snapToStep(1.2000000001, ICON_SCALE_RANGE)).toBe(1.2);
    expect(snapToStep(0.5 + 0.05 * 3, ICON_SCALE_RANGE)).toBe(0.65);
    expect(snapToStep(1.27, ICON_SCALE_RANGE)).toBe(1.25);
    expect(snapToStep(99, ICON_SCALE_RANGE)).toBe(4);
    expect(snapToStep(-3, ICON_SIZE_RANGE)).toBe(24);
    expect(snapToStep(68.6, ICON_SIZE_RANGE)).toBe(69);
  });

  it("maps the track to the range and catches on the default while dragging", () => {
    expect(valueAtFraction(0, ICON_SIZE_RANGE)).toBe(24);
    expect(valueAtFraction(1, ICON_SIZE_RANGE)).toBe(140);
    expect(valueAtFraction(-0.4, ICON_SIZE_RANGE)).toBe(24);
    expect(valueAtFraction(1.4, ICON_SCALE_RANGE)).toBe(4);
    const at = (value: number, range: typeof ICON_SIZE_RANGE) => (value - range.min) / (range.max - range.min);
    expect(valueAtFraction(at(69, ICON_SIZE_RANGE), ICON_SIZE_RANGE)).toBe(70);
    expect(valueAtFraction(at(71, ICON_SIZE_RANGE), ICON_SIZE_RANGE)).toBe(70);
    expect(valueAtFraction(at(68, ICON_SIZE_RANGE), ICON_SIZE_RANGE)).toBe(68);
    expect(valueAtFraction(at(72, ICON_SIZE_RANGE), ICON_SIZE_RANGE)).toBe(72);
    expect(valueAtFraction(at(1.05, ICON_SCALE_RANGE), ICON_SCALE_RANGE)).toBe(1);
    expect(valueAtFraction(at(1.1, ICON_SCALE_RANGE), ICON_SCALE_RANGE)).toBe(1.1);
  });

  it("steps with the keyboard: arrows, Shift+arrows and Page keys, Home and End", () => {
    expect(valueForKey("ArrowRight", false, 68, ICON_SIZE_RANGE)).toBe(69);
    expect(valueForKey("ArrowUp", false, 68, ICON_SIZE_RANGE)).toBe(69);
    expect(valueForKey("ArrowLeft", false, 68, ICON_SIZE_RANGE)).toBe(67);
    expect(valueForKey("ArrowDown", true, 68, ICON_SIZE_RANGE)).toBe(58);
    expect(valueForKey("PageUp", false, 68, ICON_SIZE_RANGE)).toBe(78);
    expect(valueForKey("ArrowRight", true, 136, ICON_SIZE_RANGE)).toBe(140);
    expect(valueForKey("Home", false, 68, ICON_SIZE_RANGE)).toBe(24);
    expect(valueForKey("End", false, 68, ICON_SIZE_RANGE)).toBe(140);
    expect(valueForKey("ArrowRight", false, 1.2, ICON_SCALE_RANGE)).toBe(1.25);
    expect(valueForKey("ArrowRight", true, 1.2, ICON_SCALE_RANGE)).toBe(1.45);
    // Keyboard steps never catch on the default: 0.95 and 1.05 stay reachable.
    expect(valueForKey("ArrowLeft", false, 1, ICON_SCALE_RANGE)).toBe(0.95);
    expect(valueForKey("Tab", false, 68, ICON_SIZE_RANGE)).toBeNull();
  });

  it("uses the native range input for focus and screen readers, with units in aria-valuetext", () => {
    const slider = read("components/admin/ui/editor-kit/RangeSlider.tsx");
    expect(slider).toMatch(/<input ref=\{input\} id=\{id\} type="range"/);
    expect(slider).toContain("aria-valuetext={describe(value)}");
    // The range input is the first focusable inside the slider, so click-to-field focuses the slider itself.
    const body = slider.slice(slider.indexOf("data-range-slider"));
    expect(body.indexOf('type="range"')).toBeLessThan(body.indexOf("<button"));
    const sizing = read("components/admin/about/rose-city/CrestIconSizing.tsx");
    expect(sizing).toContain("describe={value => `${value} pixels`}");
    expect(sizing).toContain("describe={value => `${value.toFixed(2)} times`}");
  });
});

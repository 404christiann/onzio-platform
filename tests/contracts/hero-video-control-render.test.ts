import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { createHeroVideoController, type HeroVideoDeps } from "@/lib/homepage-editor/hero-video-upload";
import HomepagePartFields, { type HomepagePartEditor } from "@/components/admin/homepage/HomepagePartFields";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ storeEnabled: true }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: () => null }));

const STATUS = { liveGuid: "11111111-2222-3333-4444-555555555555", previousGuid: "prev", replacesUsedToday: 2, replacesPerDay: 5, maxBytes: 524_288_000, maxSeconds: 600 };
const editor = (heroVideo?: ReturnType<typeof createHeroVideoController>): HomepagePartEditor => ({
  draft: { ...homepageDraft(), revamp: defaultCinematicHomepageContent() }, disabled: false, maxPhotos: 7, programs: [], photoCaptionEditable: false, videoSourceSet: true,
  field: () => undefined, setRevamp: () => undefined, setPhotos: () => undefined, updatePhoto: () => undefined, removePhoto: () => undefined,
  retryPhoto: () => undefined, addPhotos: () => undefined, replaceArtwork: () => undefined, retryArtwork: () => undefined, heroVideo,
});
const html = (e: HomepagePartEditor) => renderToStaticMarkup(createElement(HomepagePartFields, { part: "hero", e }));

describe("hero video control rendering", () => {
  it("templates without the control keep the Onzio line and render no video control", () => {
    const markup = html(editor());
    expect(markup).toContain("The background video and poster are set by Onzio.");
    expect(markup).not.toContain("Hero video");
  });

  it("shows the preview, replace, revert, allowance and the not-part-of-Save note", async () => {
    const controller = createHeroVideoController({ getStatus: async () => STATUS } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup).not.toContain("set by Onzio");
    expect(markup).toContain("play_240p.mp4");
    expect(markup).toContain("Replace video");
    expect(markup).toContain("Revert to previous");
    expect(markup).toContain("3 of 5 replaces left today");
    expect(markup).toContain("not part of the Save button");
    expect(markup).toContain('accept="video/*"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Maximum file size 500 MB");
    expect(markup).toContain("up to 10 minutes");
    expect(markup).toContain("Maximum file size 500 MB, up to 10 minutes, at least 720p.");
    expect(markup).toMatch(/<p role="status" aria-live="polite" class="[^"]*status[^"]*"><\/p>/);
    expect(markup).not.toMatch(/guid/i);
  });

  it("revert confirms inline: no nested dialog, Escape handled locally, focus moved in and out", () => {
    const source = readFileSync("components/admin/homepage/HeroVideoControl.tsx", "utf8");
    expect(source).not.toContain("AdminConfirmDialog");
    expect(source).toContain("Go back to the previous video? It goes live on your website right away; you don’t need to press Save.");
    expect(source).toContain("event.stopPropagation()");
    expect(source).toContain("stopImmediatePropagation");
    expect(source).toMatch(/Revert video<\/EditorPrimaryButton>/);
    expect(source).toContain("focusQuietly(revertButton.current)");
    expect(source).toContain("target.focus({ preventScroll: true })");
    expect(source).toContain('scrollIntoView({ block: "nearest" })');
    for (const file of ["HeroVideoControl.tsx", "useHeroVideoController.ts"]) {
      const text = readFileSync(`components/admin/homepage/${file}`, "utf8");
      expect(text.match(/\.focus\(/g) ?? []).toHaveLength((text.match(/\.focus\(\{ preventScroll: true \}\)/g) ?? []).length);
    }
  });

  it("the confirmation is closed on first render", async () => {
    const controller = createHeroVideoController({ getStatus: async () => STATUS } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup).not.toContain("Revert video");
    expect(markup).not.toContain("Go back to the previous video?");
  });

  it("shows the Load latest notice after a conflicting swap", async () => {
    const controller = createHeroVideoController({
      getStatus: async () => STATUS, revert: async () => ({ status: "live", liveGuid: "p", previousGuid: "l", revisionBefore: "a", revisionAfter: "b" }),
      refreshRevision: async () => "conflict", sleep: async () => undefined,
    } as unknown as HeroVideoDeps);
    await controller.load(); await controller.revert();
    expect(html(editor(controller))).toContain("also changed somewhere else while your video was switching");
  });

  it("with no previous video there is no revert button and no video preview", async () => {
    const controller = createHeroVideoController({ getStatus: async () => ({ ...STATUS, liveGuid: "", previousGuid: "" }) } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup).toContain("No hero video yet");
    expect(markup).not.toContain("Revert to previous");
    expect(markup).not.toContain("<video");
  });
});

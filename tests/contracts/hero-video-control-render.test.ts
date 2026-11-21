import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { createHeroVideoController, type HeroVideoDeps } from "@/lib/homepage-editor/hero-video-upload";
import HomepagePartFields, { type HomepagePartEditor } from "@/components/admin/homepage/HomepagePartFields";
import { HeroVideoNotice } from "@/components/admin/homepage/HeroVideoControl";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ storeEnabled: true }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: () => null }));

const STATUS = { liveGuid: "11111111-2222-3333-4444-555555555555", previousGuid: "prev", replacesUsedToday: 2, replacesPerDay: 10, maxBytes: 524_288_000, maxSeconds: 600 };
const editor = (heroVideo?: ReturnType<typeof createHeroVideoController>): HomepagePartEditor => ({
  draft: { ...homepageDraft(), revamp: defaultCinematicHomepageContent() }, disabled: false, maxPhotos: 7, programs: [], photoCaptionEditable: false, videoSourceSet: true,
  field: () => undefined, setRevamp: () => undefined, setPhotos: () => undefined, updatePhoto: () => undefined, removePhoto: () => undefined,
  retryPhoto: () => undefined, addPhotos: () => undefined, replaceArtwork: () => undefined, retryArtwork: () => undefined, heroVideo,
});
// React escapes an apostrophe in text; read the markup the way the page shows it.
const html = (e: HomepagePartEditor) => renderToStaticMarkup(createElement(HomepagePartFields, { part: "hero", e })).replaceAll("&#x27;", "'");
const FAILED = "We couldn't finish this video. Try again or use a different file.";
const LEAVE = "You can leave this page; we'll finish in the background.";
const KEEP_OPEN = "Keep this page open until the upload finishes.";
const NEVER = () => new Promise<void>(() => undefined);
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const file = { name: "hero.mp4", size: 10_000_000, type: "video/mp4" } as unknown as File;
const row = (effective: string, encodeProgress: number | null = null) => ({ videoGuid: "new-guid", encodeProgress, effective });
const bar = (markup: string) => markup.match(/<div class="[^"]*track[^"]*" role="progressbar"[^>]*>/)?.[0] ?? "";
const replaceButton = (markup: string) => markup.match(/<button[^>]*>(?:(?!<\/button>).)*Replace video<\/button>/)?.[0] ?? "";

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
    expect(markup).toContain("8 of 10 replaces left today");
    expect(markup).toContain("not part of the Save button");
    expect(markup).toContain('accept="video/*"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Maximum file size 500 MB");
    expect(markup).toContain("up to 10 minutes");
    expect(markup).toContain("8 of 10 replaces left today. Maximum file size 500 MB, up to 10 minutes, at least 720p.");
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

describe("hero video control rendering: one bar from upload to live", () => {
  /** A control that is mid-upload at `sent` of 10 MB, with the bytes' handlers in hand. */
  async function uploading(sent: number, getStatus: HeroVideoDeps["getStatus"] = async () => STATUS) {
    const handlers: { current: Parameters<HeroVideoDeps["startUpload"]>[2] | null } = { current: null };
    const deps: Partial<HeroVideoDeps> = {
      getStatus, start: async () => ({ videoGuid: "new-guid", upload: {} as never, maxBytes: STATUS.maxBytes }), readDuration: async () => undefined,
      markUploaded: async () => undefined, abandon: async () => undefined, startUpload: (_file, _ticket, h) => { handlers.current = h; return { abort: () => undefined }; },
      refreshRevision: async () => "applied", sleep: NEVER,
    };
    const controller = createHeroVideoController(deps as HeroVideoDeps);
    await controller.load();
    await controller.replace(file);
    handlers.current!.onProgress(sent, 10_000_000);
    return { controller, handlers };
  }

  it("uploading: a single progressbar at 20 percent for 50 percent of the bytes, labeled Uploading… with the keep-open line and no leave line", async () => {
    const { controller } = await uploading(5_000_000);
    const markup = html(editor(controller));
    expect(markup.match(/role="progressbar"/g)).toHaveLength(1);
    expect(bar(markup)).toContain('aria-valuenow="20"');
    expect(bar(markup)).toContain('aria-valuemin="0"');
    expect(bar(markup)).toContain('aria-valuemax="100"');
    expect(bar(markup)).toContain('aria-valuetext="Uploading…"');
    expect(markup).toMatch(/<p role="status" aria-live="polite" class="[^"]*status[^"]*">Uploading…<\/p>/);
    expect(markup).toContain('style="width:20%"');
    expect(markup).toContain(KEEP_OPEN);
    expect(markup).not.toContain(LEAVE);
    expect(markup).not.toContain("data-hero-check");
    expect(markup).not.toContain("data-working");
    expect(markup).not.toMatch(/\d+%<\/span>/);
    controller.dispose();
  });

  it("the moment the bytes land there is no check: the same bar sits at 40 percent and reads Processing… with the leave line", async () => {
    const { controller, handlers } = await uploading(10_000_000);
    handlers.current!.onSuccess();
    const markup = html(editor(controller));
    expect(markup).not.toContain("data-hero-check");
    expect(markup.match(/role="progressbar"/g)).toHaveLength(1);
    expect(bar(markup)).toContain('aria-valuenow="40"');
    expect(bar(markup)).toContain('aria-valuetext="Processing…"');
    expect(markup).toContain(LEAVE);
    expect(markup).not.toContain(KEEP_OPEN);
    expect(markup).toContain("data-working");
    controller.dispose();
  });

  it("processing: the server's 50 percent is 70 on the bar, and no percent holds at 40", async () => {
    const half = createHeroVideoController({ getStatus: async () => ({ ...STATUS, pending: row("preparing", 50) }), sleep: NEVER } as unknown as HeroVideoDeps);
    await half.load();
    expect(bar(html(editor(half)))).toContain('aria-valuenow="70"');
    expect(html(editor(half))).toContain('style="width:70%"');
    half.dispose();
    const none = createHeroVideoController({ getStatus: async () => ({ ...STATUS, pending: row("preparing") }), sleep: NEVER } as unknown as HeroVideoDeps);
    await none.load();
    const markup = html(editor(none));
    expect(bar(markup)).toContain('aria-valuenow="40"');
    expect(markup).toContain(LEAVE);
    expect(markup.match(/role="progressbar"/g)).toHaveLength(1);
    none.dispose();
  });

  it("live is the only success state: Your new video is live. with the drawn check and a full bar, and no leave line", async () => {
    const live = { ...STATUS, liveGuid: "new-guid", pending: row("live"), completion: { videoGuid: "new-guid", revisionBefore: null, revisionAfter: null } };
    const controller = createHeroVideoController({ getStatus: async () => live } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup.match(/data-hero-check/g)).toHaveLength(1);
    expect(bar(markup)).toContain('aria-valuenow="100"');
    expect(bar(markup)).toContain('aria-valuetext="Your new video is live."');
    expect(markup).toMatch(/<p role="status" aria-live="polite" class="[^"]*status[^"]*"><svg[^>]*data-hero-check[^>]*>.*<\/svg>Your new video is live\.<\/p>/);
    expect(markup).not.toContain(LEAVE);
  });

  it("idle shows no bar and no hint", async () => {
    const controller = createHeroVideoController({ getStatus: async () => STATUS } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup).not.toContain("progressbar");
    expect(markup).not.toContain(LEAVE);
    expect(markup).not.toContain(KEEP_OPEN);
  });

  it.each([
    ["MP4_MISSING", { ...STATUS, pending: row("failed"), failure: { code: "MP4_MISSING" } }],
    ["RESOLUTION_MISSING", { ...STATUS, pending: row("failed"), failure: { code: "RESOLUTION_MISSING" } }],
    ["VIDEO_FAILED", { ...STATUS, pending: row("failed"), failure: { code: "VIDEO_FAILED" } }],
    ["a failed row with an unknown code", { ...STATUS, pending: row("failed"), failure: { code: "SOMETHING_NEW" } }],
    ["preparing_overdue", { ...STATUS, pending: row("preparing_overdue") }],
    ["uploading_overdue", { ...STATUS, pending: row("uploading_overdue") }],
  ])("%s shows the failure copy, no bar and no video-service words, with Replace and Revert enabled", async (_label, status) => {
    const controller = createHeroVideoController({ getStatus: async () => status } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup).toMatch(/<div role="alert"[^>]*><p>We couldn't finish this video\. Try again or use a different file\.<\/p>/);
    expect(markup).toContain(FAILED);
    expect(markup).not.toMatch(/bunny|video service|MP4_MISSING|RESOLUTION_MISSING|VIDEO_FAILED|PREPARE_TIMEOUT/i);
    expect(markup).not.toContain("progressbar");
    expect(replaceButton(markup)).not.toBe("");
    expect(replaceButton(markup)).not.toContain("disabled");
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>(?:(?!<\/button>).)*Revert to previous<\/button>/);
  });

  it.each([
    ["VIDEO_TOO_LONG", "This video is longer than 10 minutes. Use a shorter clip."],
    ["RESOLUTION_TOO_LOW", "This video is below 720p. Use a video that is at least 720p."],
    ["STORED_SIZE_TOO_LARGE", "This video is too large once processed. Use a shorter clip (up to 10 minutes)."],
  ])("a failed row with %s shows its own copy instead of the generic one, with Replace and Revert enabled and no code or video-service words", async (code, copy) => {
    const controller = createHeroVideoController({ getStatus: async () => ({ ...STATUS, pending: row("failed"), failure: { code } }) } as unknown as HeroVideoDeps);
    await controller.load();
    const markup = html(editor(controller));
    expect(markup).toMatch(new RegExp(`<div role="alert"[^>]*><p>${copy.replace(/[().]/g, "\\$&")}</p>`));
    expect(markup).not.toContain(FAILED);
    expect(markup).not.toMatch(/bunny|video service|VIDEO_TOO_LONG|RESOLUTION_TOO_LOW|STORED_SIZE_TOO_LARGE/i);
    expect(markup).not.toContain("progressbar");
    expect(replaceButton(markup)).not.toBe("");
    expect(replaceButton(markup)).not.toContain("disabled");
    expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>(?:(?!<\/button>).)*Revert to previous<\/button>/);
  });

  it("a failure keeps the specific pre-upload messages for the other errors", async () => {
    const controller = createHeroVideoController({ getStatus: async () => STATUS, readDuration: async () => 601 } as unknown as HeroVideoDeps);
    await controller.load();
    await controller.replace(file);
    const markup = html(editor(controller));
    expect(markup).toContain("This video is longer than 10 minutes. Use a shorter clip.");
    expect(markup).not.toContain(FAILED);
  });

  it("the page notice names the stage and carries the matching line, and the navigation guard's phase is only the upload", async () => {
    const { controller, handlers } = await uploading(2_000_000);
    expect(renderToStaticMarkup(createElement(HeroVideoNotice, { controller }))).toContain(`Uploading… ${KEEP_OPEN}`);
    handlers.current!.onSuccess();
    expect(renderToStaticMarkup(createElement(HeroVideoNotice, { controller })).replaceAll("&#x27;", "'")).toContain(`Processing… ${LEAVE}`);
    controller.dispose();
    const idle = createHeroVideoController({ getStatus: async () => STATUS } as unknown as HeroVideoDeps);
    await idle.load();
    expect(renderToStaticMarkup(createElement(HeroVideoNotice, { controller: idle }))).toBe("");
  });

  it("the page keeps one bar and one label: no check at upload end, no dots, no separate percent, and motion is off when asked", () => {
    const source = readFileSync("components/admin/homepage/HeroVideoControl.tsx", "utf8");
    const css = readFileSync("components/admin/homepage/HeroVideoControl.module.css", "utf8");
    expect(source).not.toContain("uploaded");
    expect(source).not.toContain("data-hero-working");
    expect(source).not.toContain("progressText");
    expect(source.match(/role="progressbar"/g)).toHaveLength(1);
    expect(css).not.toMatch(/\.working|heroWork|\.progressText/);
    const animated = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .status:has(.check)"));
    expect(animated).toContain(".bar[data-working]");
    expect(css.replace(animated, "")).not.toContain("heroBarPulse 1.6s");
  });
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import { saveHomepage, expectHomepageSaved, closeHomepageEditor, openHomepagePlayback, closeHomepagePlayback, homepageCanvas, homepageSaveButton } from "./helpers/homepage-editor-controls";
async function openHeadingEditor(page: Page) {
    await page.goto("/admin/homepage");
    const frame = homepageCanvas(page);
    const heading = frame.locator('[data-homepage-piece="hero.heading"]');
    await expect(heading).toBeVisible();
    await heading.click();
    await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
    return { frame, heading };
}
const heroDialog = (page: Page) => page.getByRole("dialog", { name: "Hero", exact: true });
async function expectFocusInside(page: Page, panel: Locator) {
    await expect.poll(() => panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await expect(panel).toBeVisible();
}
async function expectModalIsolation(page: Page, panel: Locator) {
    if (await panel.getAttribute("data-slot") !== "admin-dialog") {
        await expect(panel).toHaveAttribute("aria-modal", "true");
        return;
    }
    await expect(panel).toBeVisible();
    await expect(panel).toHaveRole("dialog");
    await expect(panel).toHaveAccessibleName("Hero");
    for (const background of [page.locator(".hc-canvas iframe"), homepageSaveButton(page), page.locator("#admin-sidebar[data-slot=sidebar]")]) {
        await expect(background).toHaveCount(1);
        await expect.poll(() => background.evaluate(element => element.closest('[aria-hidden="true"]') !== null)).toBe(true);
    }
    await expect.poll(() => panel.evaluate(element => element.closest('[aria-hidden="true"], [inert]') === null)).toBe(true);
    await expectFocusInside(page, panel);
    await page.keyboard.press("Tab");
    await expectFocusInside(page, panel);
    await page.keyboard.press("Shift+Tab");
    await expectFocusInside(page, panel);
}
test.describe("homepage editor accessibility and playback acceptance", () => {
    for (const width of [320, 390])
        test(`mobile modal closes before navigation without losing selection focus at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 678 });
            const { heading } = await openHeadingEditor(page);
            await expect(heading).toHaveAttribute("aria-pressed", "true");
            await expectModalIsolation(page, heroDialog(page));
            // The accepted dialog contains focus; navigation becomes available after Done.
            await closeHomepageEditor(page);
            await expect(heading).toBeFocused();
            await page.getByRole("button", { name: "Open admin navigation" }).click();
            await expect(page.getByRole("button", { name: "Close admin navigation" })).toBeVisible();
            await expect(heading).toHaveAttribute("aria-pressed", "false");
            await page.getByRole("button", { name: "Close admin navigation" }).click();
            await expect(page.getByRole("button", { name: "Preview of your homepage", exact: true })).toBeVisible();
            await expect(heroDialog(page)).not.toBeVisible();
        });
    test("admin navigation keeps an unsaved tablet draft after its dialog closes", async ({ page }) => {
        await page.setViewportSize({ width: 820, height: 800 });
        const marker = `Unsaved menu check ${crypto.randomUUID().slice(0, 8)}`;
        const { heading } = await openHeadingEditor(page);
        await page.getByLabel("Line one", { exact: true }).fill(marker);
        await closeHomepageEditor(page);
        await expect(page.locator("[data-admin-save-status]")).toContainText("Unsaved changes");
        await page.getByRole("button", { name: "Open admin navigation" }).click();
        await expect(page.getByRole("button", { name: "Close admin navigation" })).toBeVisible();
        await expect(heroDialog(page)).not.toBeVisible();
        await expect(heading).toHaveAttribute("aria-pressed", "false");
        await page.getByRole("button", { name: "Close admin navigation" }).click();
        await expect(heading).toContainText(marker);
        await expect(page.getByRole("button", { name: "Preview of your homepage", exact: true })).toBeVisible();
        await expect(page.locator("[data-admin-save-status]")).toContainText("Unsaved changes");
    });
    test("resizing an open tablet navigation to desktop restores editor controls", async ({ page }) => {
        await page.setViewportSize({ width: 820, height: 800 });
        const marker = `Unsaved resize check ${crypto.randomUUID().slice(0, 8)}`;
        const { heading } = await openHeadingEditor(page);
        await page.getByLabel("Line one", { exact: true }).fill(marker);
        await closeHomepageEditor(page);
        await page.getByRole("button", { name: "Open admin navigation" }).click();
        await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "expanded");
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
        await expect(heading).toHaveAttribute("aria-pressed", "false");
        await page.setViewportSize({ width: 1100, height: 800 });
        await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "collapsed");
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
        await expect(heading).toContainText(marker);
        await expect(page.getByRole("button", { name: "Preview of your homepage", exact: true })).toBeVisible();
        await expect(page.locator("[data-admin-save-status]")).toContainText("Unsaved changes");
        await page.setViewportSize({ width: 820, height: 800 });
        await expect(page.getByRole("button", { name: "Open admin navigation" })).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "collapsed");
        await expect(page.getByRole("button", { name: "Preview of your homepage", exact: true })).toBeVisible();
    });
    test("admin navigation hides editor save feedback until the menu closes", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 678 });
        await page.route("**/api/admin/homepage", route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "Your changes are still here." } }) }) : route.continue());
        await openHeadingEditor(page);
        await page.getByLabel("Line one", { exact: true }).fill(`Unsaved feedback ${crypto.randomUUID().slice(0, 8)}`);
        await saveHomepage(page);
        await expect(page.locator(".hp-notification-error")).toBeVisible();
        await page.getByRole("button", { name: "Open admin navigation" }).click();
        await expect(page.locator(".hp-notification")).toHaveCount(0);
        await page.getByRole("button", { name: "Close admin navigation" }).click();
        await expect(page.locator(".hp-notification-error")).toBeVisible();
    });
    test("a successful save notice does not expire behind admin navigation", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 678 });
        const marker = `Menu success notice ${crypto.randomUUID().slice(0, 8)}`;
        const baseline = await (await page.request.get("/api/admin/homepage")).json();
        try {
            await openHeadingEditor(page);
            await page.getByLabel("Line one", { exact: true }).fill(marker);
            await saveHomepage(page);
            await expect(page.locator(".hp-notification-success")).toBeVisible();
            await page.getByRole("button", { name: "Open admin navigation" }).click();
            await expect(page.locator(".hp-notification")).toHaveCount(0);
            await page.waitForTimeout(5500);
            await page.getByRole("button", { name: "Close admin navigation" }).click();
            await expect(page.locator(".hp-notification-success")).toBeVisible();
        }
        finally {
            const currentResponse = await page.request.get("/api/admin/homepage");
            if (currentResponse.ok()) {
                const current = await currentResponse.json();
                if (current.content.hero.headline_line_one === marker) {
                    const restored = await page.request.post("/api/admin/homepage", { data: { operationId: crypto.randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { hero: baseline.content.hero } } });
                    expect(restored.ok()).toBe(true);
                }
            }
        }
    });
    for (const viewport of [{ width: 390, height: 678, name: "phone" }, { width: 320, height: 568, name: "narrow phone" }]) {
        test(`mobile dialog contains native Tab and Shift-Tab focus at ${viewport.name} size`, async ({ page }) => {
            await page.setViewportSize(viewport);
            const { frame } = await openHeadingEditor(page);
            const panel = heroDialog(page);
            await expect(panel).toBeVisible();
            await expect(panel.getByRole("button", { name: "Done", exact: true })).toBeVisible();
            await expect(panel.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
            await expect(panel.getByRole("heading", { name: "Hero", exact: true })).toBeVisible();
            await expect(page.locator("[data-admin-save-button]")).toHaveCount(1);
            const count = await panel.locator('button:not(:disabled):visible,input:not(:disabled):visible,textarea:not(:disabled):visible,select:not(:disabled):visible').count();
            expect(count).toBeGreaterThan(1);
            for (let index = 0; index < count + 1; index++) {
                await page.keyboard.press("Tab");
                await expectFocusInside(page, panel);
            }
            for (let index = 0; index < count + 1; index++) {
                await page.keyboard.press("Shift+Tab");
                await expectFocusInside(page, panel);
            }
            await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toHaveAttribute("aria-pressed", "true");
        });
    }
    test("desktop accepted dialog is modal and keeps native focus contained", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openHeadingEditor(page);
        const panel = heroDialog(page);
        await expectModalIsolation(page, panel);
        await expect(panel.getByRole("button", { name: "Done", exact: true })).toBeVisible();
        const last = panel.locator('button:not(:disabled):visible,input:not(:disabled):visible,textarea:not(:disabled):visible,select:not(:disabled):visible').last();
        await last.focus();
        await page.keyboard.press("Tab");
        await expectFocusInside(page, panel);
    });
    test("header save feedback moves into a reopened dialog without duplication", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.route("**/api/admin/homepage", route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here." } }) }) : route.continue());
        const { frame } = await openHeadingEditor(page);
        await page.getByLabel("Line one", { exact: true }).fill("Panel toast stays local");
        await saveHomepage(page, "hero.heading");
        await expect(heroDialog(page).locator(".hp-notification-error")).toBeVisible();
        await expect(heroDialog(page).locator(".hp-notification-error")).toContainText("Your changes are still here.");
        await expect(page.locator(".hp-notification-error")).toHaveCount(1);
        await expect(page.locator("body > .hp-notification-error")).toHaveCount(0);
        await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText("Panel toast stays local");
    });
    test("one notification queue: dismissible success is not replayed after dialog remount", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 678 });
        const { frame, heading } = await openHeadingEditor(page);
        await page.getByLabel("Line one", { exact: true }).fill(`Queue check ${Date.now()}`);
        await saveHomepage(page, "hero.heading");
        await expectHomepageSaved(page);
        await expect(page.locator(".hp-notification-success")).toHaveCount(1);
        await expect(page.locator(".hp-notification")).toHaveCount(1);
        await closeHomepageEditor(page);
        await expect(heroDialog(page)).not.toBeVisible();
        await expect(page.locator(".hp-notification-success")).toHaveCount(1);
        await expect(page.locator(".hp-notification")).toHaveCount(1);
        await page.locator(".hp-notification-success").getByRole("button", { name: "Dismiss notification" }).click();
        await expect(page.locator(".hp-notification")).toHaveCount(0);
        await heading.click();
        await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
        await expect(page.locator(".hp-notification")).toHaveCount(0);
        await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toBeVisible();
    });
    test("a confirmed save keeps its notification while the pointer rests on it", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openHeadingEditor(page);
        await page.getByLabel("Line one", { exact: true }).fill(`Hover pause ${Date.now()}`);
        await saveHomepage(page);
        const success = page.locator(".hp-notification-success");
        await expect(success).toBeVisible();
        await success.hover();
        await page.waitForTimeout(6500);
        await expect(success).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(success).toBeHidden({ timeout: 10000 });
    });
    for (const width of [1152, 1280])
        for (const piece of ["hero.heading", "hero.intro"])
            test(`opening ${piece} at ${width}px does not resize its public preview`, async ({ page }) => {
                await page.setViewportSize({ width, height: 800 });
                await page.goto("/admin/homepage");
                const frame = homepageCanvas(page);
                const target = frame.locator(`[data-homepage-piece="${piece}"]`);
                await expect(target).toBeVisible();
                await target.scrollIntoViewIfNeeded();
                const placement = () => page.evaluate(selector => {
                    const iframe = document.querySelector(".hc-canvas iframe") as HTMLIFrameElement;
                    const preview = iframe.contentDocument!;
                    const node = preview.querySelector(selector)!;
                    const frameBox = iframe.getBoundingClientRect(), box = node.getBoundingClientRect();
                    return { top: frameBox.top + box.top, width: iframe.clientWidth, insidePreview: box.top >= -1 && box.bottom <= preview.defaultView!.innerHeight + 1, insideWindow: frameBox.top + box.top >= 0 && frameBox.top + box.bottom <= innerHeight };
                }, `[data-homepage-piece="${piece}"]`);
                const before = await placement();
                expect(before.insidePreview).toBe(true);
                await target.click();
                await expect(heroDialog(page)).toBeVisible();
                const after = await placement();
                expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(100);
                expect(after.width).toBe(before.width);
                expect(after.insidePreview).toBe(true);
                expect(after.insideWindow).toBe(true);
            });
    test("an empty target placeholder gives way to typed text and returns when cleared", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/admin/homepage");
        const frame = homepageCanvas(page);
        const eyebrow = frame.locator('[data-homepage-piece="hero.eyebrow"]');
        await expect(eyebrow).toBeVisible();
        const placeholder = () => page.evaluate(() => { const preview = (document.querySelector(".hc-canvas iframe") as HTMLIFrameElement).contentDocument!; const node = preview.querySelector('[data-homepage-piece="hero.eyebrow"]')!; return { drawn: preview.defaultView!.getComputedStyle(node, "::before").content, flagged: (node as HTMLElement).dataset.homepagePieceEmpty ?? null, text: node.textContent?.trim() ?? "" }; });
        await eyebrow.click();
        const field = page.getByLabel("Small heading", { exact: true });
        await field.fill("");
        await expect.poll(async () => (await placeholder()).flagged).toBe("true");
        expect((await placeholder()).drawn).toContain("Small heading");
        const typed = "Members of the club";
        await field.fill(typed);
        await expect(eyebrow).toContainText(typed);
        const filled = await placeholder();
        expect(filled.flagged).toBeNull();
        expect(filled.drawn === "none" || filled.drawn === '""').toBe(true);
        expect(filled.text).toBe(typed);
        await field.fill("");
        await expect.poll(async () => (await placeholder()).flagged).toBe("true");
    });
    test("shared-section shortcuts fit a phone row and keep full accessible names", async ({ page }) => {
        await page.setViewportSize({ width: 402, height: 874 });
        await page.goto("/admin/homepage");
        const row = page.locator(".hp-shared-links");
        const programs = page.getByRole("button", { name: "Edit in Programs", exact: true });
        await expect(programs).toBeVisible();
        await expect(programs).toContainText("Programs", { useInnerText: true });
        await expect(programs).not.toContainText("Edit in", { useInnerText: true });
        await expect(row).toContainText("Edited elsewhere:", { useInnerText: true });
        expect((await row.boundingBox())!.height).toBeLessThanOrEqual(56);
        expect((await programs.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(programs).toContainText("Edit in Programs", { useInnerText: true });
    });
    test("Escape closes the accepted dialog, restores iframe focus and keeps the draft", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 678 });
        const { heading } = await openHeadingEditor(page);
        const draft = "Draft survives closing options";
        await page.getByLabel("Line one", { exact: true }).fill(draft);
        await page.getByLabel("Line one", { exact: true }).press("Escape");
        await expect(heroDialog(page)).not.toBeVisible();
        await expect(heading).toContainText(draft);
        await expect(heading).toBeFocused();
        await expect(heading).toHaveAttribute("aria-pressed", "false");
    });
    test("whole-page playback preserves the unsaved draft and makes no POST", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const { frame } = await openHeadingEditor(page);
        const draft = "Playback draft heading";
        await page.getByLabel("Line one", { exact: true }).fill(draft);
        const posts: string[] = [];
        page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/admin/homepage"))
            posts.push(request.url()); });
        const playback = await openHomepagePlayback(page);
        await expect(page.getByRole("dialog", { name: "Preview of your homepage", exact: true })).toBeVisible();
        await expect(playback.locator("[data-homepage-piece][aria-pressed]")).toHaveCount(0);
        await expect(playback.locator("h1").first()).toContainText(draft);
        expect(posts).toHaveLength(0);
        await closeHomepagePlayback(page);
        await frame.locator('[data-homepage-piece="hero.heading"]').click();
        await expect(page.getByLabel("Line one", { exact: true })).toHaveValue(draft);
        await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText(draft);
        expect(posts).toHaveLength(0);
    });
    test("editing canvas hides public chrome and exposes labeled selected targets", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/admin/homepage");
        const frame = homepageCanvas(page);
        await expect(frame.locator("nav,footer")).toHaveCount(0);
        const heading = frame.locator('[data-homepage-piece="hero.heading"]');
        await expect(heading).toHaveAttribute("aria-label", "Main heading");
        await heading.click();
        await expect(heading).toHaveAttribute("aria-pressed", "true");
        await expect(heading.locator(":scope > .hp-piece-label")).toHaveCount(0);
        await expect(heading).toHaveAttribute("aria-label", "Main heading");
        await expect.poll(() => heading.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
        await expect(heading.locator(":scope > .hp-piece-corners > i")).toHaveCount(4);
        await expect(frame.locator('[data-homepage-piece="hero.intro"] > .hp-piece-corners')).toBeHidden();
        const playback = await openHomepagePlayback(page);
        await expect(playback.locator("nav")).toBeVisible();
        await expect(playback.locator("footer")).toBeVisible();
        await expect(playback.locator("[data-homepage-piece]")).toHaveCount(0);
    });
    test("narrow preview has no horizontal overflow with reduced motion", async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/admin/homepage");
        await expect(page.getByText("Changes appear on your website after you save.")).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await expect.poll(() => homepageCanvas(page).locator("html").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
});
test("theme stays in editor chrome and mobile selection targets meet44px", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 678 });
    for (const theme of ["light", "dark"]) {
        await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, domain: "alpha.localhost", path: "/admin" }]);
        await page.goto("/admin/homepage");
        await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
        const frame = homepageCanvas(page);
        await expect(frame.locator("h1")).toBeVisible();
        await expect(frame.locator("[data-admin-theme]")).toHaveCount(0);
        for (const piece of await frame.locator("[data-homepage-piece]").all()) {
            const box = await piece.boundingBox();
            expect(box?.height).toBeGreaterThanOrEqual(44);
            expect(box?.width).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: info.outputPath(`mobile-${theme}.png`), fullPage: true });
    }
});
test("preview links cannot navigate the parent app in local editing or playback", async ({ page }) => {
    await page.goto("/admin/homepage");
    const frame = homepageCanvas(page);
    await expect(frame.locator("h1")).toBeVisible();
    await frame.locator('main a[href="/club/about"]').first().click();
    await expect(page).toHaveURL(/\/admin\/homepage$/);
    const playback = await openHomepagePlayback(page);
    await expect(playback.locator('nav a[href="/roster"]').first()).toBeVisible();
    await expect(playback.locator('main a[href="/roster"]')).toHaveCount(0);
    const primary = playback.locator("main").getByRole("link", { name: "Next match", exact: true });
    await expect(primary).toHaveAttribute("href", "/schedule");
    await expect(primary).toBeVisible();
    await primary.click();
    await expect(page).toHaveURL(/\/admin\/homepage$/);
    await expect(playback.locator("h1")).toBeVisible();
});
test("a failed mobile header save is announced in its reopened modal and retains the field", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 408 });
    await page.route("**/api/admin/homepage", route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here." } }) }) : route.continue());
    await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill("Keep my mobile draft");
    await saveHomepage(page, "hero.heading");
    const panel = heroDialog(page);
    await expect(panel.getByRole("alert")).toContainText("Your changes are still here.");
    await expect(panel.getByRole("button", { name: "Try saving again", exact: true })).toBeVisible();
    await expect(page.getByLabel("Line one", { exact: true })).toHaveValue("Keep my mobile draft");
    await expect(panel.getByRole("button", { name: "Done", exact: true })).toBeInViewport();
});
test("tablet rotation and desktop resizing preserve the open draft without overflow", async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill("Draft across sizes");
    for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 390, height: 678 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => { }))); });
        await expect(page.getByLabel("Line one", { exact: true })).toHaveValue("Draft across sizes");
        await expect(heroDialog(page).getByRole("button", { name: "Done", exact: true })).toBeInViewport();
        await expect(page.locator("[data-admin-save-button]")).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`options-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
    await page.keyboard.press("Escape");
    await expect(heroDialog(page)).not.toBeVisible();
    await expect(homepageSaveButton(page)).toBeVisible();
});

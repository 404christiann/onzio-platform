import { expect, test, type Locator, type Page } from "@playwright/test";

async function openHeadingEditor(page: Page) {
  await page.goto("/admin/homepage");
  const frame = page.frameLocator('iframe[title="Homepage preview"]');
  const heading = frame.locator('[data-homepage-piece="hero.heading"]');
  await expect(heading).toBeVisible();
  await heading.click();
  await heading.click();
  await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
  return { frame, heading };
}

async function expectFocusInside(page: Page, panel: Locator) {
  await expect.poll(() => page.locator(".hp-panel").evaluate(element => element.contains(document.activeElement))).toBe(true);
  await expect(panel).toBeVisible();
}

test.describe("homepage editor accessibility and playback acceptance", () => {
  for (const width of [320, 390]) test(`opening mobile admin navigation dismisses editor controls and selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 678 });
    await page.goto("/admin/homepage");
    const heading = page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.heading"]');
    await expect(heading).toBeVisible();
    await page.getByRole("button", { name: "Top", exact: true }).click();
    await expect(heading).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".hp-thumb-bar")).toBeVisible();

    await page.getByRole("button", { name: "Open admin navigation" }).click();
    await expect(page.getByRole("button", { name: "Close admin navigation" })).toBeVisible();
    await expect(page.locator(".hp-thumb-bar")).toBeHidden();
    await expect(heading).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Close admin navigation" }).click();
    await expect(page.locator(".hp-thumb-bar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Top", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change the words", exact: true })).toHaveCount(0);
  });

  test("admin navigation closes a tablet editor panel without losing unsaved work", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 800 });
    const marker = `Unsaved menu check ${crypto.randomUUID().slice(0, 8)}`;
    const { heading } = await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill(marker);
    await expect(page.getByRole("status").filter({ hasText: "Not saved yet: Top of your homepage" })).toBeVisible();

    await page.getByRole("button", { name: "Open admin navigation" }).click();
    await expect(page.getByRole("button", { name: "Close admin navigation" })).toBeVisible();
    await expect(page.locator(".hp-panel")).toHaveCount(0);
    await expect(page.locator(".hp-toolbar")).toBeHidden();
    await expect(heading).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Close admin navigation" }).click();
    await expect(page.locator(".hp-toolbar")).toBeVisible();
    await expect(heading).toContainText(marker);
    await expect(page.getByRole("status").filter({ hasText: "Not saved yet: Top of your homepage" })).toBeVisible();
  });

  test("resizing an open tablet navigation to desktop restores editor controls", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 800 });
    const marker = `Unsaved resize check ${crypto.randomUUID().slice(0, 8)}`;
    const { heading } = await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill(marker);

    await page.getByRole("button", { name: "Open admin navigation" }).click();
    await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "expanded");
    await expect(page.locator(".hp-toolbar")).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(heading).toHaveAttribute("aria-pressed", "false");

    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "collapsed");
    await expect(page.locator(".hp-toolbar")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
    await expect(heading).toContainText(marker);
    await expect(page.getByRole("status").filter({ hasText: "Not saved yet: Top of your homepage" })).toBeVisible();

    await page.setViewportSize({ width: 820, height: 800 });
    await expect(page.getByRole("button", { name: "Open admin navigation" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute("data-state", "collapsed");
    await expect(page.locator(".hp-toolbar")).toBeVisible();
  });

  test("admin navigation also hides editor save feedback until the menu closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 678 });
    await page.route("**/api/admin/homepage", route => route.request().method() === "POST"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "Your changes are still here." } }) })
      : route.continue());
    await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill(`Unsaved feedback ${crypto.randomUUID().slice(0, 8)}`);
    await page.locator(".hp-panel").getByRole("button", { name: "Save homepage", exact: true }).click();
    await expect(page.locator(".hp-notification-error")).toBeVisible();
    await page.locator(".hp-panel").getByRole("button", { name: "Done", exact: true }).click();
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
      await page.locator(".hp-panel").getByRole("button", { name: "Save homepage", exact: true }).click();
      await expect(page.locator(".hp-notification-success")).toBeVisible();
      await page.locator(".hp-panel").getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("button", { name: "Open admin navigation" }).click();
      await expect(page.locator(".hp-notification")).toHaveCount(0);
      await page.waitForTimeout(5_500);
      await page.getByRole("button", { name: "Close admin navigation" }).click();
      await expect(page.locator(".hp-notification-success")).toBeVisible();
    } finally {
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

  for (const viewport of [
    { width: 390, height: 678, name: "phone" },
    { width: 320, height: 568, name: "narrow phone" },
  ]) {
    test(`mobile options sheet contains focus at ${viewport.name} size`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { frame } = await openHeadingEditor(page);
      const panel = page.locator('.hp-panel');

      await expect(panel).toBeVisible();
      await expect(panel.getByRole("button", { name: "Done", exact: true })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Save homepage", exact: true })).toBeVisible();
      await expect(panel.getByRole("heading", { name: "Main heading", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true })).toHaveCount(1);

      const focusableCount = await panel.locator('button:not(:disabled):visible,input:not(:disabled):visible,textarea:not(:disabled):visible,select:not(:disabled):visible').count();
      expect(focusableCount).toBeGreaterThan(1);
      for (let index = 0; index < focusableCount + 1; index += 1) {
        await page.keyboard.press("Tab");
        await expectFocusInside(page, panel);
      }
      for (let index = 0; index < focusableCount + 1; index += 1) {
        await page.keyboard.press("Shift+Tab");
        await expectFocusInside(page, panel);
      }

      // Selection survives opening the modal, whose background is inert.
      await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toHaveAttribute("aria-pressed", "true");
    });
  }

  test("desktop options panel is nonmodal and permits focus to leave", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await openHeadingEditor(page);
    const panel = page.locator('.hp-panel');
    await expect(panel).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(panel).not.toHaveAttribute("aria-modal", "true");
    await expect(panel.getByRole("button", { name: "Save homepage", exact: true })).toBeVisible();

    const lastFocusable = panel.locator('button:not(:disabled):visible,input:not(:disabled):visible,textarea:not(:disabled):visible,select:not(:disabled):visible').last();
    await lastFocusable.focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => panel.evaluate(element => element.contains(document.activeElement))).toBe(false);
  });

  test("panel save keeps its notification beside the panel action", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/admin/homepage", route => route.request().method() === "POST"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here." } }) })
      : route.continue());
    const { frame } = await openHeadingEditor(page);
    const panel = page.locator(".hp-panel");
    await page.getByLabel("Line one", { exact: true }).fill("Panel toast stays local");
    await panel.getByRole("button", { name: "Save homepage", exact: true }).click();
    await expect(panel.locator(".hp-notification-error")).toContainText("Your changes are still here.");
    await expect(panel.locator(".hp-notification-error")).toBeVisible();
    await expect(page.locator("body > .hp-notification-error")).toHaveCount(0);
    await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText("Panel toast stays local");
  });

  test("one notification queue: no duplicate announcement on phones, dismissible success, no replay on remount", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 678 });
    const { frame, heading } = await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill(`Queue check ${Date.now()}`);
    await page.locator(".hp-panel").getByRole("button", { name: "Save homepage", exact: true }).click();

    // A save owns exactly one notification, however many hosts could show it.
    await expect(page.locator(".hp-notification-success")).toHaveCount(1);
    await expect(page.locator(".hp-notification")).toHaveCount(1);

    // Closing the options sheet must not replay the confirmation.
    await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(".hp-panel")).toBeHidden();
    await expect(page.locator(".hp-notification-success")).toHaveCount(1);
    await expect(page.locator(".hp-notification")).toHaveCount(1);

    // Reselecting and reopening options must not resurrect it either.
    await page.locator(".hp-notification-success").getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.locator(".hp-notification")).toHaveCount(0);
    await heading.click();
    await heading.click();
    await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
    await expect(page.locator(".hp-notification")).toHaveCount(0);
    await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toBeVisible();
  });

  test("a confirmed save keeps its notification while the pointer rests on it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHeadingEditor(page);
    await page.getByLabel("Line one", { exact: true }).fill(`Hover pause ${Date.now()}`);
    await page.locator(".hp-panel").getByRole("button", { name: "Save homepage", exact: true }).click();
    const success = page.locator(".hp-notification-success");
    await expect(success).toBeVisible();

    // Timed dismissal pauses under the pointer, so a message being read is not
    // pulled away mid-sentence. Five seconds is the unpaused lifetime.
    await success.hover();
    await page.waitForTimeout(6500);
    await expect(success).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(success).toBeHidden({ timeout: 10_000 });
  });

  // Opening the options panel takes 348px from the preview, so the real public
  // page rewraps inside a narrower viewport. Before this was anchored, the piece
  // being edited slid 276-312px down at ordinary laptop widths and left the
  // preview entirely: people edited a heading they could no longer see.
  for (const width of [1152, 1280]) {
    for (const piece of ["hero.heading", "hero.intro"]) {
      test(`selecting ${piece} at ${width}px keeps it in view when options open`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/admin/homepage");
        const frame = page.frameLocator('iframe[title="Homepage preview"]');
        const target = frame.locator(`[data-homepage-piece="${piece}"]`);
        await expect(target).toBeVisible();

        const placement = () => page.evaluate(selector => {
          const element = document.querySelector('iframe[title="Homepage preview"]') as HTMLIFrameElement;
          const preview = element.contentDocument!;
          const node = preview.querySelector(selector)!;
          const frameBox = element.getBoundingClientRect();
          const box = node.getBoundingClientRect();
          return {
            top: frameBox.top + box.top,
            insidePreview: box.top >= -1 && box.bottom <= preview.defaultView!.innerHeight + 1,
            insideWindow: frameBox.top + box.top >= 0 && frameBox.top + box.bottom <= window.innerHeight,
          };
        }, `[data-homepage-piece="${piece}"]`);

        await target.click();
        const selected = await placement();
        expect(selected.insidePreview).toBe(true);

        await target.click();
        await expect(page.locator(".hp-panel")).toBeVisible();
        const opened = await placement();

        expect(Math.abs(opened.top - selected.top)).toBeLessThanOrEqual(100);
        expect(opened.insidePreview).toBe(true);
        expect(opened.insideWindow).toBe(true);
      });
    }
  }

  // An empty target shows its own label as a CSS ::before placeholder so it can
  // still be found and clicked. That placeholder used to be added and never
  // removed, so typing produced "SMALL HEADINGThis is my text" in the preview.
  // ::before content is invisible to textContent, so assert the drawn content.
  test("an empty target's placeholder label gives way to typed text and returns when cleared", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/homepage");
    const frame = page.frameLocator('iframe[title="Homepage preview"]');
    const eyebrow = frame.locator('[data-homepage-piece="hero.eyebrow"]');
    await expect(eyebrow).toBeVisible();

    const placeholder = () => page.evaluate(() => {
      const preview = (document.querySelector('iframe[title="Homepage preview"]') as HTMLIFrameElement).contentDocument!;
      const node = preview.querySelector('[data-homepage-piece="hero.eyebrow"]')!;
      return {
        drawn: preview.defaultView!.getComputedStyle(node, "::before").content,
        flagged: (node as HTMLElement).dataset.homepagePieceEmpty ?? null,
        text: node.textContent?.trim() ?? "",
      };
    });

    await eyebrow.click();
    await eyebrow.click();
    const field = page.locator(".hp-panel .hp-field").first();
    await expect(field).toBeVisible();

    await field.fill("");
    await expect.poll(async () => (await placeholder()).flagged).toBe("true");
    const empty = await placeholder();
    expect(empty.drawn).toContain("Small heading");

    const typed = "Members of the club";
    await field.fill(typed);
    await expect(eyebrow).toContainText(typed);
    const filled = await placeholder();
    expect(filled.flagged).toBeNull();
    // No label may be drawn in front of what the person typed.
    expect(filled.drawn === "none" || filled.drawn === '""').toBe(true);
    expect(filled.text).toBe(typed);

    await field.fill("");
    await expect.poll(async () => (await placeholder()).flagged).toBe("true");
  });

  // On phones the shared-section shortcuts collapse to one row so the preview is
  // not squeezed; the visible names shorten but the accessible names must not.
  test("shared-section shortcuts fit one row on a phone and keep full accessible names", async ({ page }) => {
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

  test("Escape closes the sheet, restores iframe focus, and keeps the draft", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 678 });
    const { heading } = await openHeadingEditor(page);
    const draft = "Draft survives closing options";
    await page.getByLabel("Line one", { exact: true }).fill(draft);
    await page.getByLabel("Line one", { exact: true }).press("Escape");

    await expect(page.locator('.hp-panel')).toBeHidden();
    await expect(heading).toContainText(draft);
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("aria-pressed", "true");
  });

  test("Playback preview is clearly labeled, preserves the draft, and does not save", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { frame } = await openHeadingEditor(page);
    const draft = "Playback draft heading";
    await page.getByLabel("Line one", { exact: true }).fill(draft);

    const posts: string[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && request.url().endsWith("/api/admin/homepage")) posts.push(request.url());
    });
    await page.getByRole("button", { name: "Playback preview", exact: true }).click();
    await expect(page.getByText("Preview — not your live site.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to editing", exact: true })).toBeVisible();
    await expect(frame.locator("[data-homepage-piece][aria-pressed]")).toHaveCount(0);
    await expect(frame.locator("h1").first()).toContainText(draft);
    expect(posts).toHaveLength(0);

    await page.getByRole("button", { name: "Back to editing", exact: true }).click();
    await frame.locator('[data-homepage-piece="hero.heading"]').click();
    await expect(page.getByLabel("Line one", { exact: true })).toHaveValue(draft);
    await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText(draft);
    expect(posts).toHaveLength(0);
  });

  test("editing canvas hides public chrome and exposes labeled selected targets", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/homepage");
    const frame = page.frameLocator('iframe[title="Homepage preview"]');
    await expect(frame.locator("nav, footer")).toHaveCount(0);
    const heading = frame.locator('[data-homepage-piece="hero.heading"]');
    await expect(heading).toHaveAttribute("aria-label", "Main heading");
    await heading.click();
    await expect(heading).toHaveAttribute("aria-pressed", "true");
    await expect(heading.locator(":scope > .hp-piece-label")).toHaveCount(0);
    await expect(heading).toHaveAttribute("aria-label", "Main heading");
    await expect.poll(() => heading.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
    await expect(heading.locator(":scope > .hp-piece-corners > i")).toHaveCount(4);
    await expect(frame.locator('[data-homepage-piece="hero.intro"] > .hp-piece-corners')).toBeHidden();
    await page.getByRole("button", { name: "Playback preview", exact: true }).click();
    await expect(frame.locator("nav")).toBeVisible();
    await expect(frame.locator("footer")).toBeVisible();
    await expect(frame.locator("[data-homepage-piece]")).toHaveCount(0);
  });

  test("narrow preview has no horizontal overflow with reduced motion enabled", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/admin/homepage");
    await expect(page.getByText("Preview · Changes appear on your website after you save.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const frame = page.frameLocator('iframe[title="Homepage preview"]');
    await expect.poll(() => frame.locator("html").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});

test("theme stays in editor chrome and all mobile selection targets meet 44px", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 678 });
  for (const theme of ["light", "dark"]) {
    await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, domain: "alpha.localhost", path: "/admin" }]);
    await page.goto("/admin/homepage");
    await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
    const frame = page.frameLocator('iframe[title="Homepage preview"]');
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

test("preview links cannot navigate the parent app in selection or playback mode", async ({ page }) => {
  await page.goto("/admin/homepage");
  const frame = page.frameLocator('iframe[title="Homepage preview"]');
  await expect(frame.locator("h1")).toBeVisible();
  const editingLink = frame.locator('main a[href="/club/about"]').first();
  await editingLink.click();
  await expect(page).toHaveURL(/\/admin\/homepage$/);
  await page.getByRole("button", { name: "Playback preview", exact: true }).click();
  await expect(frame.locator('nav a[href="/roster"]').first()).toBeVisible();
  const cta = frame.locator('main a[href="/roster"]').first();
  await cta.click();
  await expect(page).toHaveURL(/\/admin\/homepage$/);
  await expect(frame.locator("h1")).toBeVisible();
});

test("a failed mobile save is announced inside the modal and retains the field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 408 });
  await page.route("**/api/admin/homepage", route => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here." } }) })
    : route.continue());
  await openHeadingEditor(page);
  const panel = page.locator(".hp-panel");
  await page.getByLabel("Line one", { exact: true }).fill("Keep my mobile draft");
  await panel.getByRole("button", { name: "Save homepage", exact: true }).click();
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
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
    await expect(page.getByLabel("Line one", { exact: true })).toHaveValue("Draft across sizes");
    await expect(page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`options-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".hp-panel")).toBeHidden();
});

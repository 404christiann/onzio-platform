import { expect, type Page } from "@playwright/test";

export type AdminAlignmentOptions = {
  headerSelector?: string;
  contentSelector?: string;
  controlRowsSelector?: string;
  repeatedRowsSelector?: string;
};

export async function checkAdminAlignment(
  page: Page,
  options: AdminAlignmentOptions = {},
): Promise<string[]> {
  return page.evaluate((selectors) => {
    const issues: string[] = [];
    const header = document.querySelector(selectors.headerSelector ?? "[data-admin-page-header]");
    if (!(header instanceof HTMLElement)) return ["Admin page header is missing"];
    const box = (element: Element) => element.getBoundingClientRect();
    const visible = (element: Element) => {
      const rect = box(element);
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    };
    const title = header.querySelector("h1");
    const crumb = header.querySelector("[data-admin-page-breadcrumb]");
    const subtitle = header.querySelector("p");
    if (!title) issues.push("Header title is missing");
    if (!crumb) issues.push("Header breadcrumb text is missing");
    if (title) {
      for (const [name, element] of [["breadcrumb", crumb], ["subtitle", subtitle]] as const) {
        if (element && visible(element) && Math.abs(box(element).left - box(title).left) > 1) {
          issues.push(`Header ${name} left edge differs from title`);
        }
      }
      if (getComputedStyle(title).fontSize !== "28px") issues.push("Header title is not 28px");
      if (subtitle && parseFloat(getComputedStyle(subtitle).marginTop) !== 6) {
        issues.push("Header subtitle gap is not 6px");
      }
    }
    const actions = header.querySelector("[data-admin-page-actions]");
    if (actions && visible(actions)) {
      const width = box(header).width;
      if (matchMedia("(max-width: 639px)").matches) {
        if (Math.abs(box(actions).width - width) > 1) issues.push("Phone actions do not fill the header");
      } else if (Math.abs(box(actions).right - box(header).right) > 1) {
        issues.push("Header actions right edge differs from header");
      }
    }
    if (selectors.contentSelector) {
      const content = document.querySelector(selectors.contentSelector);
      if (!content) issues.push("Content selector has no match");
      else if (title && visible(content) && Math.abs(box(content).left - box(title).left) > 1) {
        issues.push("Content left edge differs from header title");
      }
    }
    if (selectors.controlRowsSelector) {
      for (const row of document.querySelectorAll(selectors.controlRowsSelector)) {
        const controls = [...row.children].filter((element) =>
          element.matches("button,input,select,[role='button']") && visible(element));
        const rows: Element[][] = [];
        for (const control of controls) {
          const bounds = box(control);
          const rowGroup = rows.find((group) => group.some((other) => {
            const previous = box(other);
            return bounds.top < previous.bottom - 2 && bounds.bottom > previous.top + 2;
          }));
          if (rowGroup) rowGroup.push(control);
          else rows.push([control]);
        }
        for (const group of rows) {
          if (group.length < 2) continue;
          const centers = group.map((element) => (box(element).top + box(element).bottom) / 2);
          if (Math.max(...centers) - Math.min(...centers) > 2) {
            issues.push("Controls in a row do not share a center line");
          }
        }
      }
    }
    if (selectors.repeatedRowsSelector) {
      const rows = [...document.querySelectorAll(selectors.repeatedRowsSelector)].filter(visible);
      const columns = Math.min(...rows.map((row) => row.children.length));
      if (rows.length > 1 && Number.isFinite(columns)) {
        for (let index = 0; index < columns; index++) {
          const positions = rows.map((row) => box(row.children[index]).left);
          if (Math.max(...positions) - Math.min(...positions) > 2) {
            issues.push(`Column ${index + 1} drifts across repeated rows`);
          }
        }
      }
    }
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (overflow > 1) issues.push(`Page scrolls sideways by ${overflow}px`);
    return issues;
  }, options);
}

export async function checkAdminDialog(
  page: Page,
  selector = '[data-slot="admin-dialog"][data-open]',
): Promise<string[]> {
  await expect.poll(() => page.locator(selector).evaluate((element) =>
    element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  return page.evaluate((popupSelector) => {
    const issues: string[] = [];
    const popup = document.querySelector(popupSelector);
    if (!(popup instanceof HTMLElement)) return ["No open AdminDialog"];
    const header = popup.querySelector('[data-slot="admin-dialog-header"]');
    const body = popup.querySelector('[data-slot="admin-dialog-body"]');
    const footer = popup.querySelector('[data-slot="admin-dialog-footer"]');
    const title = popup.querySelector('[data-slot="admin-dialog-title"]');
    const close = popup.querySelector('[data-slot="admin-dialog-close"]');
    const box = (element: Element) => element.getBoundingClientRect();
    const rect = box(popup);
    const phone = matchMedia("(max-width: 700px)").matches;
    const expected = { sm: 440, md: 540, lg: 640, xl: 860 }[
      popup.getAttribute("data-size") as "sm" | "md" | "lg" | "xl" ?? "md"
    ];
    if (phone) {
      if (Math.abs(rect.width - innerWidth) > 2) issues.push("Phone dialog is not full width");
    } else if (!expected || Math.abs(rect.width - expected) > 2) {
      issues.push(`Dialog width ${Math.round(rect.width)}px differs from its size`);
    }
    if (rect.top < -2 || rect.bottom > innerHeight + 2 ||
      rect.left < -2 || rect.right > innerWidth + 2) issues.push("Dialog leaves the viewport");
    if (!header) issues.push("Dialog header is missing");
    if (!body) issues.push("Dialog scrolling body is missing");
    if (!footer) issues.push("Dialog footer is missing");
    if (!title || !close) issues.push("Dialog title or close button is missing");
    if (header && title && close) {
      const titleRect = box(title);
      const closeRect = box(close);
      if (titleRect.left > closeRect.left) issues.push("Dialog close button is left of title");
      if (Math.abs((titleRect.top + titleRect.bottom - closeRect.top - closeRect.bottom) / 2) > 3) {
        issues.push("Dialog title and close button are not centered together");
      }
    }
    if (body) {
      const style = getComputedStyle(body);
      if (!/auto|scroll/.test(style.overflowY)) issues.push("Dialog body does not scroll");
      if (body.scrollWidth > body.clientWidth + 1) issues.push("Dialog body scrolls sideways");
      if (header && body.contains(header)) issues.push("Dialog header is inside scrolling body");
      if (footer && body.contains(footer)) issues.push("Dialog footer is inside scrolling body");
      if (header && box(header).bottom > box(body).top + 2) issues.push("Dialog header overlaps body");
      if (footer && box(footer).top < box(body).bottom - 2) issues.push("Dialog footer overlaps body");
      const left = parseFloat(style.paddingLeft);
      const right = parseFloat(style.paddingRight);
      if (left < 16 || left > 28 || Math.abs(left - right) > 1) issues.push("Dialog body padding is outside 16–28px");
      const fields = [...body.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea")]
        .filter((element) => box(element).width > 1 && box(element).height > 1);
      const minimum = phone ? 120 : 160;
      for (const field of fields) {
        if (box(field).width < minimum) issues.push(`Dialog field is under ${minimum}px`);
        const nested = field.closest("label");
        const external = field.id
          ? popup.querySelector(`label[for="${CSS.escape(field.id)}"]`)
          : null;
        const label = nested ?? external;
        if (label) {
          let textBottom = -Infinity;
          const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent?.trim()) continue;
            const parent = node.parentElement;
            if (parent?.closest("input,select,textarea,button,[aria-hidden='true']")) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) textBottom = Math.max(textBottom, rect.bottom);
          }
          if (textBottom > box(field).top + 2) issues.push("Dialog label is below its field");
        }
      }
      const groups = new Map<number, number>();
      for (const field of fields) {
        const top = Math.round(box(field).top / 4) * 4;
        groups.set(top, (groups.get(top) ?? 0) + 1);
      }
      if ([...groups.values()].some((count) => count > (phone ? 1 : 2))) {
        issues.push("Dialog has too many fields in one row");
      }
      if (fields.length >= 5 && !body.querySelector('[data-slot="admin-dialog-section"]')) {
        issues.push("Long dialog has no section heading");
      }
    }
    if (footer) {
      const buttons = [...footer.querySelectorAll("button")].filter((button) => box(button).width > 1);
      if (!buttons.length) issues.push("Dialog footer has no buttons");
      const widths = buttons.map((button) => box(button).height);
      if (widths.length > 1 && Math.max(...widths) - Math.min(...widths) > 2) {
        issues.push("Dialog footer button heights differ");
      }
      if (phone) {
        for (const button of buttons) {
          if (box(button).height < 44) issues.push("Phone dialog button is under 44px high");
          if (box(button).width < box(footer).width - 42) issues.push("Phone dialog button is not full width");
        }
      } else if (buttons.length && box(footer).right - parseFloat(getComputedStyle(footer).paddingRight) -
        Math.max(...buttons.map((button) => box(button).right)) > 2) {
        issues.push("Dialog footer actions are not right aligned");
      }
      const primary = footer.querySelector('[data-admin-save-button], button:has([data-admin-pending-label]), [data-primary]');
      if (primary && buttons.includes(primary as HTMLButtonElement)) {
        const primaryRect = box(primary);
        if (phone && buttons.some((button) => button !== primary && box(button).top < primaryRect.top - 2)) {
          issues.push("Dialog primary action is not first on phone");
        }
        if (!phone && buttons.some((button) => button !== primary && box(button).right > primaryRect.right + 2)) {
          issues.push("Dialog primary action is not last on desktop");
        }
      }
      for (let i = 0; i < buttons.length; i++) {
        for (let j = i + 1; j < buttons.length; j++) {
          const a = box(buttons[i]);
          const b = box(buttons[j]);
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
            issues.push("Dialog footer buttons overlap");
          }
        }
      }
    }
    return [...new Set(issues)];
  }, selector);
}

export async function checkAdminSaveButton(
  page: Page,
  selector = "[data-admin-save-button]",
): Promise<string[]> {
  return page.evaluate((buttonSelector) => {
    const issues: string[] = [];
    const button = document.querySelector(buttonSelector);
    if (!(button instanceof HTMLButtonElement)) return ["AdminSaveButton is missing"];
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const state = button.dataset.state;
    const labels = [...button.querySelectorAll("[data-admin-save-label]")].filter((label) =>
      label.getAttribute("aria-hidden") !== "true" && parseFloat(getComputedStyle(label).opacity) > 0.5);
    if (labels.length !== 1) issues.push("Save button does not show exactly one label");
    for (const label of labels) {
      const text = document.createRange();
      text.selectNodeContents(label);
      const bounds = text.getBoundingClientRect();
      if (Math.abs((bounds.left + bounds.right - rect.left - rect.right) / 2) > 2) {
        issues.push("Save label is not horizontally centered");
      }
      if (Math.abs((bounds.top + bounds.bottom - rect.top - rect.bottom) / 2) > 2) {
        issues.push("Save label is not vertically centered");
      }
      if (bounds.left < rect.left + 8 || bounds.right > rect.right - 8) {
        issues.push("Save label is too close to button edge");
      }
    }
    if (rect.width < 149.5) issues.push("Save button is narrower than 150px");
    if (button.scrollWidth > button.clientWidth + 1) issues.push("Save label overflows");
    if (state === "dirty" || state === "saved") {
      if (style.color !== "rgb(255, 255, 255)") issues.push("Dirty or saved label is not white");
    }
    if (state === "saved" && !["rgb(52, 199, 89)", "rgb(48, 209, 88)"].includes(style.backgroundColor)) {
      issues.push("Saved button does not use accepted green");
    }
    if (style.backgroundColor === "rgba(0, 0, 0, 0)") issues.push("Save button has no fill");
    const status = button.parentElement?.parentElement?.querySelector("[data-admin-save-status]");
    if (status?.textContent?.trim()) {
      const statusRect = status.getBoundingClientRect();
      const stacked = status.closest("[data-stack-on-mobile]") && matchMedia("(max-width: 640px)").matches;
      if (!stacked && Math.abs((statusRect.top + statusRect.bottom - rect.top - rect.bottom) / 2) > 1.5) {
        issues.push("Save status is not on button center line");
      }
    }
    return issues;
  }, selector);
}

export type SkeletonShiftOptions = {
  regionSelector: string;
  skeletonSelector: string;
  contentSelector: string;
  anchorSelector?: string;
  trigger: () => Promise<unknown>;
};

export async function measureSkeletonShift(
  page: Page,
  options: SkeletonShiftOptions,
): Promise<{ skeletonHeight: number; contentHeight: number; anchorShift: number; heightShift: number }> {
  await options.trigger();
  await expect(page.locator(options.skeletonSelector)).toBeVisible();
  const before = await page.evaluate(({ regionSelector, anchorSelector }) => {
    const region = document.querySelector(regionSelector);
    if (!region) throw new Error("Skeleton region is missing");
    const anchor = anchorSelector && document.querySelector(anchorSelector);
    return {
      height: region.getBoundingClientRect().height,
      anchorTop: anchor ? anchor.getBoundingClientRect().top : 0,
    };
  }, { regionSelector: options.regionSelector, anchorSelector: options.anchorSelector });
  await expect(page.locator(options.contentSelector)).toBeVisible();
  await expect(page.locator(options.skeletonSelector)).toBeHidden();
  const after = await page.evaluate(({ regionSelector, anchorSelector }) => {
    const region = document.querySelector(regionSelector);
    if (!region) throw new Error("Skeleton region is missing");
    const anchor = anchorSelector && document.querySelector(anchorSelector);
    return {
      height: region.getBoundingClientRect().height,
      anchorTop: anchor ? anchor.getBoundingClientRect().top : 0,
    };
  }, { regionSelector: options.regionSelector, anchorSelector: options.anchorSelector });
  return {
    skeletonHeight: before.height,
    contentHeight: after.height,
    anchorShift: after.anchorTop - before.anchorTop,
    heightShift: after.height - before.height,
  };
}

export async function checkCompositorAnimations(
  page: Page,
  selector: string,
  requireActive = true,
): Promise<string[]> {
  return page.evaluate(({ selector: scopeSelector, requireActive: activeRequired }) => {
    const issues: string[] = [];
    const scopes = [...document.querySelectorAll(scopeSelector)].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    if (!scopes.length) return ["Animation scope is missing"];
    const animations = scopes.flatMap((scope) => scope.getAnimations({ subtree: true }));
    if (activeRequired && animations.length === 0) issues.push("No active animation in scope");
    const allowed = new Set(["opacity", "transform"]);
    for (const animation of animations) {
      if (!(animation.effect instanceof KeyframeEffect)) continue;
      for (const frame of animation.effect.getKeyframes()) {
        for (const property of Object.keys(frame)) {
          if (["offset", "computedOffset", "easing", "composite"].includes(property)) continue;
          if (!allowed.has(property)) issues.push(`Animation uses ${property} instead of transform or opacity`);
        }
      }
    }
    return [...new Set(issues)];
  }, { selector, requireActive });
}

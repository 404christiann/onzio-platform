import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  ADMIN_MOTION_CURVES,
  ADMIN_MOTION_DURATIONS,
  ADMIN_MOTION_GREENS,
  ADMIN_MOTION_MAX_BARS,
} from "@/lib/admin-motion";

const root = process.cwd();
const css = parse(readFileSync(resolve(root, "styles/globals.css"), "utf8"));
const classicPortal = String.raw`\.admin-portal:not\(\[data-admin-shell="reimagined"\]\)`;
const portalScope = new RegExp(
  String.raw`^(?:\.admin-theme\[data-admin-theme="(?:light|dark)"\]\s+)?${classicPortal}$`,
);
const pressScope = new RegExp(
  String.raw`^(?:(?:${classicPortal}|:where\(${classicPortal}\))\s+\.admin-press(?![\w-])|:where\(${classicPortal}\s+\.admin-press\)$)`,
);

function motionProperty(key: string) {
  return `--admin-motion-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function valuesOf(property: string) {
  const values: string[] = [];
  css.walkDecls(property, (declaration) => {
    values.push(declaration.value);
  });
  return values;
}

describe("classic admin motion contract", () => {
  it("publishes the approved curves, millisecond durations, bar limit, and iOS greens", () => {
    expect(ADMIN_MOTION_CURVES).toEqual({
      easeOut: "cubic-bezier(.23,1,.32,1)",
      drawer: "cubic-bezier(.32,.72,0,1)",
    });
    expect(ADMIN_MOTION_DURATIONS).toEqual({
      press: 120,
      dialogIn: 140,
      dialogOut: 90,
      sheetIn: 240,
      sheetOut: 160,
      menuIn: 140,
      menuOut: 90,
      switch: 180,
      tabUnderline: 220,
      bars: 300,
      barStagger: 40,
      listLeave: 160,
      listFlip: 240,
      listAdd: 180,
      toastIn: 200,
      toastOut: 120,
      pendingRing: 450,
      skeletonDelay: 150,
      skeletonMinimum: 350,
      skeletonCrossfade: 160,
      skeletonShimmer: 1600,
      saveColor: 220,
      saveLabel: 140,
      saveCheckDraw: 280,
      saveCheckDelay: 80,
      savePop: 320,
      savingMinimum: 400,
      savedShown: 1900,
      undoWindow: 5000,
      reducedMotionFade: 120,
    });
    expect(ADMIN_MOTION_MAX_BARS).toBe(6);
    expect(ADMIN_MOTION_GREENS).toEqual({ light: "#34C759", dark: "#30D158" });
  });

  it("mirrors the timing tokens in CSS with time units for durations", () => {
    for (const [key, curve] of Object.entries(ADMIN_MOTION_CURVES)) {
      const property = motionProperty(key);
      expect(valuesOf(property).map((value) => value.replace(/\s+/g, "")), property)
        .toEqual([curve]);
    }
    for (const [key, duration] of Object.entries(ADMIN_MOTION_DURATIONS)) {
      const property = motionProperty(key);
      expect(valuesOf(property), property).toEqual([`${duration}ms`]);
    }
    expect(valuesOf("--admin-motion-max-bars")).toEqual([String(ADMIN_MOTION_MAX_BARS)]);
  });

  it("keeps motion tokens and press rules inside the classic admin portal", () => {
    css.walkDecls(/^(?:--admin-motion-|--ios-green$)/, ({ parent, prop }) => {
      expect(parent?.type, prop).toBe("rule");
      if (parent?.type !== "rule") return;
      for (const selector of parent.selectors) {
        expect(selector, prop).toMatch(portalScope);
      }
    });
    const pressSelectors: string[] = [];
    css.walkRules(/\.admin-press(?:-row)?(?![\w-])/, (rule) => {
      for (const selector of rule.selectors) {
        pressSelectors.push(selector);
        expect(selector).toMatch(pressScope);
      }
    });
    expect(pressSelectors.length).toBeGreaterThan(0);
  });

  it.each(["light", "dark"] as const)("uses the approved green and white primary text in %s", (theme) => {
    const colors = new Map<string, string>();
    css.walkRules(portalScope, (rule) => {
      if (!rule.selector.includes(`[data-admin-theme="${theme}"]`)) return;
      rule.walkDecls(/^(?:--ios-green|--primary-foreground)$/, ({ prop, value }) => {
        colors.set(prop, value);
      });
    });
    expect(colors.get("--ios-green")?.toUpperCase()).toBe(ADMIN_MOTION_GREENS[theme]);
    expect(colors.get("--primary-foreground")).toBe("0 0% 100%");
  });

  it("uses a component-scoped fade when the user prefers reduced motion", () => {
    const pressTransitions: string[] = [];
    css.walkAtRules("media", (media) => {
      if (!/^\(prefers-reduced-motion:\s*reduce\)$/.test(media.params)) return;
      media.walkRules(/\.admin-press\b/, (rule) => {
        rule.walkDecls("transition", ({ value }) => {
          pressTransitions.push(value);
        });
      });
    });
    expect(pressTransitions).toContainEqual(
      expect.stringMatching(/^opacity\s+var\(--admin-motion-reduced-motion-fade\)/),
    );
  });

  it("does not globally disable animation or transitions", () => {
    css.walkDecls(/^(?:animation|transition)(?:-name|-property)?$/, ({ parent, value }) => {
      if (value !== "none") return;
      expect(parent?.type).toBe("rule");
      if (parent?.type !== "rule") return;
      for (const selector of parent.selectors) {
        expect(selector).toMatch(/\.[\w-]+/);
        expect(selector).not.toMatch(/(?:^|[\s>+~])\*(?:$|:)/);
      }
    });
  });

  it("adds press feedback to the existing Button variants and sizes", () => {
    expect(typeof Button).toBe("function");
    expect(buttonVariants()).toBe(buttonVariants({ variant: "default", size: "default" }));
    expect(buttonVariants()).toContain("admin-press");
    const variants = {
      default: "bg-primary",
      destructive: "bg-destructive",
      brand: "bg-brand",
      outline: "border",
      secondary: "bg-secondary",
      ghost: "hover:bg-accent",
      link: "underline-offset-4",
    } as const;
    for (const [variant, className] of Object.entries(variants)) {
      expect(buttonVariants({ variant: variant as keyof typeof variants }).split(" "))
        .toContain(className);
    }
    const sizes = {
      default: "h-9",
      sm: "h-8",
      lg: "h-10",
      icon: "size-9",
      "icon-sm": "size-8",
      "icon-lg": "size-10",
    } as const;
    for (const [size, className] of Object.entries(sizes)) {
      expect(buttonVariants({ size: size as keyof typeof sizes }).split(" ")).toContain(className);
    }
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PATHWAY_TRAINING_GATEWAY_CONFIG } from "@/components/pathway/training-gateway-config";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ACUITY_HOSTS = new Set([
  "app.acuityscheduling.com",
  "manuledesmaacademy.as.me",
]);

function expectDirectAcuityUrl(href: string) {
  const url = new URL(href);

  expect(url.protocol).toBe("https:");
  expect(ACUITY_HOSTS.has(url.hostname)).toBe(true);
  expect(url.hostname).not.toBe("squarespace-example.as.me");
  expect(url.hostname).not.toBe("www.mlasoccer.com");

  return url;
}

function perClassPrice(price: number, classes: number) {
  return Math.round((price / classes) * 100) / 100;
}

describe("pathway training gateway configuration", () => {
  it("owns the approved age groups and exact pricing in one pure data module", () => {
    expect(PATHWAY_TRAINING_GATEWAY_CONFIG.pageHref).toBe("/book-training");
    expect(PATHWAY_TRAINING_GATEWAY_CONFIG.contactHref).toBe("/contact");

    expect(
      PATHWAY_TRAINING_GATEWAY_CONFIG.ageGroups.map((group) => ({
        id: group.id,
        label: group.label,
        session: {
          durationMinutes: group.session.durationMinutes,
          price: group.session.price,
        },
        passes: group.passes.map(({ classes, price }) => ({
          classes,
          price,
          perClass: perClassPrice(price, classes),
        })),
        unlimited: {
          durationDays: group.unlimitedPass.durationDays,
          price: group.unlimitedPass.price,
        },
      })),
    ).toEqual([
      {
        id: "ages-6-10",
        label: "Ages 6–10",
        session: { durationMinutes: 60, price: 50 },
        passes: [
          { classes: 2, price: 95, perClass: 47.5 },
          { classes: 4, price: 175, perClass: 43.75 },
          { classes: 6, price: 250, perClass: 41.67 },
          { classes: 8, price: 325, perClass: 40.63 },
        ],
        unlimited: { durationDays: 31, price: 400 },
      },
      {
        id: "ages-11-14",
        label: "Ages 11–14",
        session: { durationMinutes: 60, price: 60 },
        passes: [
          { classes: 2, price: 115, perClass: 57.5 },
          { classes: 4, price: 200, perClass: 50 },
          { classes: 6, price: 275, perClass: 45.83 },
          { classes: 8, price: 325, perClass: 40.63 },
        ],
        unlimited: { durationDays: 31, price: 450 },
      },
    ]);

    for (const group of PATHWAY_TRAINING_GATEWAY_CONFIG.ageGroups) {
      for (const pass of group.passes) {
        expect(Object.hasOwn(pass, "perClassPrice")).toBe(false);
      }
    }
  });

  it("hands every offer directly to its verified Acuity entry point", () => {
    const sessionHrefs: string[] = [];
    const passHrefs: string[] = [];

    for (const group of PATHWAY_TRAINING_GATEWAY_CONFIG.ageGroups) {
      const sessionUrl = expectDirectAcuityUrl(group.session.href);
      expect(sessionUrl.pathname).toMatch(/\/appointment\/\d+\/?$/);
      sessionHrefs.push(group.session.href);

      for (const pass of [...group.passes, group.unlimitedPass]) {
        const passUrl = expectDirectAcuityUrl(pass.href);
        expect(passUrl.pathname).toMatch(/\/catalog\.php$/);
        expect(passUrl.searchParams.get("id")).toMatch(/^\d+$/);
        passHrefs.push(pass.href);
      }
    }

    expect(new Set(sessionHrefs).size).toBe(sessionHrefs.length);
    expect(new Set(passHrefs).size).toBe(passHrefs.length);
  });

  it("keeps the approved pass restrictions and disclosure copy centralized", () => {
    expect(PATHWAY_TRAINING_GATEWAY_CONFIG.visiblePolicy).toEqual([
      "For one player only",
      "Cannot be transferred",
      "Expires 31 days after purchase",
    ]);
    expect(PATHWAY_TRAINING_GATEWAY_CONFIG.policyDetails).toEqual([
      "An eight-digit booking code is emailed after purchase.",
      "Use that code when scheduling each class.",
      "Staff verify registration during check in.",
      "Only the registered player may attend.",
    ]);
    expect(PATHWAY_TRAINING_GATEWAY_CONFIG.pricingNote).toBe(
      "Final pricing confirmed on Acuity.",
    );
  });
});

describe("pathway training gateway integration", () => {
  it("uses explicit progressive triggers and one shared modal/page selector", () => {
    const trigger = read("components/pathway/PathwayTrainingTrigger.tsx");
    const provider = read("components/pathway/PathwayTrainingGatewayProvider.tsx");
    const gateway = read("components/pathway/PathwayTrainingGateway.tsx");
    const shell = read("components/pathway/PathwayShell.tsx");
    const content = read("components/pathway/content.ts");
    const page = read("app/%5Fclubs/[slug]/book-training/page.tsx");

    expect(content).toContain('action: "training-gateway"');
    expect(content).toContain('href: "/book-training"');
    expect(trigger).toContain("PATHWAY_TRAINING_GATEWAY_CONFIG.pageHref");
    expect(trigger).toContain('data-pathway-training-trigger="true"');
    expect(trigger).toContain("event.metaKey");
    expect(trigger).toContain("event.ctrlKey");
    expect(trigger).toContain("event.shiftKey");
    expect(trigger).toContain("event.altKey");
    expect(trigger).toContain("event.preventDefault()");

    expect(shell).toContain("<PathwayTrainingGatewayProvider>");
    expect(provider).toContain("dialog.showModal()");
    expect(provider).toContain('role="dialog"');
    expect(provider).toContain('aria-modal="true"');
    expect(provider).toContain("document.body.style.overflow = \"hidden\"");
    expect(provider).toContain("triggerRef.current.focus()");
    expect(provider).toContain("onCancel=");

    expect(gateway).toContain('<fieldset className="pathway-training-age-fieldset">');
    expect(gateway).toContain('type="radio"');
    expect(gateway).toContain(">Continues to Acuity<");
    expect(gateway).toContain('<details className="pathway-training-details">');
    expect(gateway).not.toContain('target="_blank"');
    expect(gateway).not.toMatch(/Manu Ledesma|Real Madrid|<img|<Image|iframe/i);

    expect(page).toContain('<PathwayTrainingGateway mode="page" />');
    expect(page).not.toContain("PathwayHero");
  });

  it("keeps the modal white-led, unstriped, pathway-scoped, and full-screen on mobile", () => {
    const css = read("styles/pathway.css");
    const block = css.slice(
      css.indexOf("/* ============ TRAINING RESERVATION GATEWAY"),
      css.indexOf("/* ============ CALM STORY"),
    );
    const mobile = block.slice(
      block.indexOf("@media (max-width: 720px)"),
      block.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-training"));

    expect(selectorLines.length).toBeGreaterThan(30);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
    expect(block).toContain("background: var(--panel);");
    expect(block).not.toContain("border-top: 4px solid var(--primary);");
    expect(block).not.toContain("border-left: 3px solid var(--primary);");
    expect(block).not.toContain("border-top: 3px solid var(--accent);");
    expect(block).toContain(
      "grid-template-columns: minmax(0, 1fr) max-content;",
    );
    expect(block).toContain("white-space: nowrap;");
    expect(block).not.toMatch(/linear-gradient|radial-gradient/);
    expect(mobile).toContain("width: 100%;");
    expect(mobile).toContain("height: 100dvh;");
    expect(mobile).toContain("border-radius: 0;");
    expect(mobile).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(mobile).toContain("env(safe-area-inset-top)");
    expect(mobile).toContain("env(safe-area-inset-bottom)");
  });
});

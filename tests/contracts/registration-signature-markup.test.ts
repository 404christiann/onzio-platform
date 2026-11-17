import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicRegistrationForm } from "@/lib/registration-public";

vi.mock("@headlessui/react", async () => {
  const { createElement: element } = await import("react");
  const container = ({ children }: { children: ReactNode }) => element("div", null, children);
  return {
    Dialog: container,
    DialogBackdrop: () => null,
    DialogPanel: container,
    DialogTitle: ({ children }: { children: ReactNode }) => element("h2", null, children),
  };
});

import RegisterModal from "@/components/registration/RegisterModal";

const form: PublicRegistrationForm = {
  slug: "signature-regression",
  title: "Registration signature regression",
  description: "",
  participantMode: "adult_only",
  waiverText: "Synthetic waiver",
  fields: [
    { key: "registrant_name", label: "Registrant name", type: "name", required: true, participantScope: "adult" },
    { key: "consent_signature", label: "Consent signature", type: "signature", required: true, participantScope: "all" },
    { key: "player_consent", label: "Player consent", type: "checkbox", required: false, participantScope: "all" },
  ],
  prices: [{ id: "11111111-1111-4111-8111-111111111111", label: "Synthetic fee", amountCents: 0 }],
};
const render = () => renderToStaticMarkup(createElement(RegisterModal, { form, open: true, onClose() {} }));
const labels = (markup: string) => [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map(match => match[1]);

describe("registration signature markup", () => {
  it("never puts a canvas and its Clear button inside a forwarding label", () => {
    const markup = render();
    expect(markup).toContain('aria-label="Signature drawing area"');
    expect(markup).toContain(">Clear</button>");
    expect(labels(markup).some(label => label.includes("<canvas"))).toBe(false);
    expect(markup).toContain('role="group" aria-label="Consent signature"');
  });

  it("retains native labels and existing field layout for ordinary inputs and checkboxes", () => {
    const markup = render();
    const name = labels(markup).find(label => label.includes("Registrant name"));
    const consent = labels(markup).find(label => label.includes("Player consent"));
    expect(name).toMatch(/<input\b[^>]*type="text"/);
    expect(consent).toMatch(/<input\b[^>]*type="checkbox"/);
    expect(markup).toContain('<label class="grid gap-1.5">');
  });
});

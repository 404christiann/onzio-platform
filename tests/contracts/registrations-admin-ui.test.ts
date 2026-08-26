import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

describe("registrations admin UI", () => {
  it("uses plain lifecycle copy, cards, and server-owned public links", async () => {
    const page = await source("app/admin/(protected)/registrations/page.tsx");
    expect(page).toContain('"Live" | "Not published" | "Archived"');
    expect(page).toContain("Stop registrations");
    expect(page).toContain("Copy link");
    expect(page).toContain("/api/admin/registrations");
    expect(page).not.toContain("Public slug");
    expect(page).not.toContain("Save draft");
    expect(page).not.toContain("overflow-x-auto");
  });

  it("uses a dollar input and separate mobile roster disclosures", async () => {
    const page = await source("app/admin/(protected)/registrations/page.tsx");
    expect(page).toContain('inputMode="decimal"');
    expect(page).toContain("parseRegistrationUsdInput");
    expect(page).toContain("formatRegistrationUsd(entry.amount_cents)");
    expect(page).not.toContain('type="number"');
    expect(page).toContain("<details");
    expect(page).toContain('className="mt-5 space-y-3 md:hidden"');
    expect(page).toContain('className="mt-5 hidden md:block"');
    expect(page).toContain("Signature captured");
    expect(page).toContain("isRegistrationSignatureValue(value)");
    expect(page).toContain("club.primaryDomain");
  });

  it("renders stopped public forms without changing submission behavior", async () => {
    const page = await source(
      "app/%5Fclubs/[slug]/register/[formSlug]/page.tsx",
    );
    expect(page).toContain('error.code === "REGISTRATION_FORM_CLOSED"');
    expect(page).toContain("Registration closed");
    expect(page).toContain("no longer accepting new submissions");

    const submit = await source("app/api/register/route.ts");
    expect(submit).toContain("loadOpenRegistrationForm");
    const service = await source("lib/registration-service.ts");
    expect(service).toContain(
      'throw new ContractError("REGISTRATION_FORM_CLOSED")',
    );
  });
});

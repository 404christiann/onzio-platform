import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDefaultRegistrationWaiverText,
  REGISTRATION_WAIVER_LEGAL_HINT,
  REGISTRATION_WAIVER_TEMPLATE,
} from "@/lib/registration-waiver";

describe("registration waiver starter content", () => {
  it("personalizes every club token while preserving the full editable draft", () => {
    const waiver = buildDefaultRegistrationWaiverText("  Alpha FC  ");

    expect(waiver).toContain("LIABILITY WAIVER AND CONSENT");
    expect(waiver).toContain("1. Assumption of Risk.");
    expect(waiver).toContain("2. Release of Liability.");
    expect(waiver).toContain("3. Medical Authorization.");
    expect(waiver).toContain("4. Photo/Media Release.");
    expect(waiver).toContain("5. Code of Conduct.");
    expect(waiver.match(/Alpha FC/g)).toHaveLength(2);
    expect(waiver).not.toContain("[Club Name]");
  });

  it("retains the visible token when no club name is available", () => {
    expect(buildDefaultRegistrationWaiverText("   ")).toBe(
      REGISTRATION_WAIVER_TEMPLATE,
    );
    expect(REGISTRATION_WAIVER_TEMPLATE.match(/\[Club Name\]/g)).toHaveLength(2);
  });

  it("warns admins that the starter text is not legal advice", () => {
    expect(REGISTRATION_WAIVER_LEGAL_HINT).toBe(
      "This is a general starting template, not legal advice. Have it reviewed by your own attorney before publishing a live paid registration form.",
    );
  });

  it("keeps the database fallback and admin builder on the shared starter copy", () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260820041635_registrations.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const sqlTemplate = migration.match(
      /\$registration_waiver\$([\s\S]*?)\$registration_waiver\$/,
    )?.[1];
    const adminPage = readFileSync(
      new URL(
        "../../app/admin/(protected)/registrations/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(sqlTemplate).toBe(REGISTRATION_WAIVER_TEMPLATE);
    expect(adminPage).toContain("buildDefaultRegistrationWaiverText(clubName)");
    expect(adminPage).toContain("{REGISTRATION_WAIVER_LEGAL_HINT}");
    expect(adminPage).toContain('aria-describedby="registration-waiver-guidance"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMIN-POSTHOG: session replay blocks any element carrying `ph-no-capture`
// (posthog-js's default blockClass). The "no PII in replay" guarantee rests on
// these class names, so each one is pinned to the element it protects.

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("ADMIN-POSTHOG replay masking", () => {
  it.each([
    ["members Team access (add form and admin list)", "app/admin/(protected)/members/page.tsx", /<section className=\{cn\("ph-no-capture", styles\.card\)\} aria-labelledby="team-access-heading"/g, 2],
    ["members remove-access confirm (shows the email)", "app/admin/(protected)/members/page.tsx", /<p className="ph-no-capture">\{removing\?\.email\}/g, 1],
    ["registrants list", "components/admin/registrations/RegistrationRegistrants.tsx", /className="ph-no-capture flex flex-col gap-4"/g, 1],
    ["registrant detail summary", "components/admin/registrations/ClassicRegistrationsEditor.tsx", /<p className="ph-no-capture">\{formatRegistrationUsd\(detail\.amount_cents\)\}/g, 1],
    ["registrant detail fields", "components/admin/registrations/ClassicRegistrationsEditor.tsx", /<dl className="ph-no-capture registration-detail">/g, 1],
    ["Stripe Connect payment account", "components/admin/registrations/RegistrationPaymentAccount.tsx", /<AdminPanel className="ph-no-capture /g, 1],
    ["payments panels", "components/admin/payments/PaymentStatusCard.tsx", /<div className=\{cn\("ph-no-capture", styles\.layout/g, 1],
    ["account-menu email", "components/admin/AdminAccountMenu.tsx", /className="ph-no-capture [^"]*"/g, 2],
    ["dialog titles (can hold a registrant's or member's name)", "components/admin/ui/AdminDialog.tsx", /<h2 id=\{titleId\} className=\{`\$\{styles\.title\} ph-no-capture`\}/g, 1],
    ["login page email (second layer; capture is already off there)", "app/admin/login/page.tsx", /<strong className="ph-no-capture [^"]*">\{email\.trim\(\)\}<\/strong>/g, 2],
  ])("masks the %s", (_label, path, pattern, count) => {
    expect(read(path).match(pattern)?.length ?? 0).toBe(count);
  });
});

describe("ADMIN-POSTHOG stops capture when the classic admin is left", () => {
  it("classic logout resets analytics after sign-out and before leaving", () => {
    expect(read("components/AdminShell.tsx")).toMatch(
      /await supabase\.auth\.signOut\(\);\s*resetAdminAnalytics\(\);\s*router\.push\("\/admin\/login"\);/,
    );
  });

  it("the provider pauses analytics when it unmounts (logout, expired session, any soft navigation out)", () => {
    expect(read("components/admin/AdminAnalyticsProvider.tsx")).toMatch(
      /identifyAdminSession\(\{ userId, clubId, clubSlug, role \}\);\s*\}\s*\/\/[^\n]*\n\s*return pauseAdminAnalytics;/,
    );
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recoveryPage = readFileSync(
  resolve(process.cwd(), "app/admin/recover/page.tsx"),
  "utf8",
);
const loginPage = readFileSync(
  resolve(process.cwd(), "app/admin/login/page.tsx"),
  "utf8",
);
const updatePasswordPage = readFileSync(
  resolve(process.cwd(), "app/admin/update-password/page.tsx"),
  "utf8",
);
const middleware = readFileSync(
  resolve(process.cwd(), "middleware.ts"),
  "utf8",
);

describe("prefetch-resistant password recovery", () => {
  it("verifies a manually submitted recovery OTP", () => {
    expect(recoveryPage).toContain("supabase.auth.verifyOtp");
    expect(recoveryPage).toContain("email,");
    expect(recoveryPage).toContain("token,");
    expect(recoveryPage).toContain('type: "recovery"');
  });

  it("sends a verified recovery session to password creation", () => {
    expect(recoveryPage).toContain(
      'router.replace("/admin/update-password")',
    );
    expect(recoveryPage).toContain("router.refresh()");
  });

  it("uses a mobile-friendly code input that accepts configured OTP lengths", () => {
    expect(recoveryPage).toContain('inputMode="numeric"');
    expect(recoveryPage).toContain('autoComplete="one-time-code"');
    expect(recoveryPage).toContain("MIN_RECOVERY_CODE_LENGTH = 6");
    expect(recoveryPage).toContain("MAX_RECOVERY_CODE_LENGTH = 10");
    expect(recoveryPage).toContain("minLength={MIN_RECOVERY_CODE_LENGTH}");
    expect(recoveryPage).toContain("maxLength={MAX_RECOVERY_CODE_LENGTH}");
    expect(recoveryPage).toContain(".slice(0, MAX_RECOVERY_CODE_LENGTH)");
  });

  it("routes successful reset requests to code entry", () => {
    expect(loginPage).toContain('href="/admin/recover"');
    expect(loginPage).toContain("Enter recovery code");
    expect(loginPage).toContain("Check your email for a recovery code");
  });

  it("keeps recovery code entry available during billing restrictions", () => {
    expect(middleware).toContain(
      'request.nextUrl.pathname !== "/admin/recover"',
    );
  });

  it("requires an enrolled MFA factor before a recovery password update", () => {
    expect(updatePasswordPage).toContain(
      "supabase.auth.mfa.getAuthenticatorAssuranceLevel",
    );
    expect(updatePasswordPage).toContain(
      'assurance.nextLevel === "aal2"',
    );
    expect(updatePasswordPage).toContain(
      'assurance.currentLevel !== "aal2"',
    );
    expect(updatePasswordPage).toContain("supabase.auth.mfa.listFactors");
    expect(updatePasswordPage).toContain("supabase.auth.mfa.challenge");
    expect(updatePasswordPage).toContain("supabase.auth.mfa.verify");
    expect(updatePasswordPage.indexOf("supabase.auth.mfa.verify")).toBeLessThan(
      updatePasswordPage.indexOf("supabase.auth.updateUser"),
    );
  });

  it("uses a mobile-friendly authenticator input during recovery", () => {
    expect(updatePasswordPage).toContain('id="recovery-mfa-code"');
    expect(updatePasswordPage).toContain('inputMode="numeric"');
    expect(updatePasswordPage).toContain('autoComplete="one-time-code"');
    expect(updatePasswordPage).toContain('pattern="[0-9]{6}"');
    expect(updatePasswordPage).toContain("maxLength={6}");
  });
});

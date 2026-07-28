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

  it("uses a mobile-friendly six-digit code input", () => {
    expect(recoveryPage).toContain('inputMode="numeric"');
    expect(recoveryPage).toContain('autoComplete="one-time-code"');
    expect(recoveryPage).toContain('pattern="[0-9]{6}"');
    expect(recoveryPage).toContain("maxLength={6}");
  });

  it("routes successful reset requests to code entry", () => {
    expect(loginPage).toContain('href="/admin/recover"');
    expect(loginPage).toContain("Enter recovery code");
    expect(loginPage).toContain("six-digit recovery code");
  });

  it("keeps recovery code entry available during billing restrictions", () => {
    expect(middleware).toContain(
      'request.nextUrl.pathname !== "/admin/recover"',
    );
  });
});

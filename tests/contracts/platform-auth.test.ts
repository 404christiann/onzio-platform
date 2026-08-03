import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  clubSessionStartedAt,
  isClubSessionFresh,
  operatorTotpVerifiedAt,
  verifyAccessTokenClaims,
} from "@/lib/auth-session";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PLAT-101 passwordless authentication contract", () => {
  const loginPage = read("app/admin/login/page.tsx");
  const authConfig = read("supabase/config.toml");
  const magicLinkTemplate = read("supabase/templates/magic_link.html");

  it("requests a code without creating unknown users and verifies exactly six digits", () => {
    expect(loginPage).toContain("supabase.auth.signInWithOtp");
    expect(loginPage).toContain("shouldCreateUser: false");
    expect(loginPage).toContain("supabase.auth.verifyOtp");
    expect(loginPage).toContain('type: "email"');
    expect(loginPage).toContain('autoComplete="one-time-code"');
    expect(loginPage).toContain('inputMode="numeric"');
    expect(loginPage).toContain("maxLength={6}");
    expect(loginPage).toContain("nextCode.length === 6");
  });

  it("maps an unknown address to the exact accepted message", () => {
    expect(loginPage).toContain("Signups not allowed for otp");
    expect(loginPage).toContain("No account for that address");
    expect(loginPage).toContain("We couldn't find an Onzio account for");
    expect(loginPage).toContain("Onzio accounts are set up by us");
    expect(loginPage).toContain("onziofutbol@gmail.com");
  });

  it("turns a repeated email request into immediate code entry", () => {
    expect(loginPage).toContain("over_email_send_rate_limit");
    expect(loginPage).toContain('setStep("code")');
    expect(loginPage).toContain("A sign-in code was sent recently");
    expect(loginPage).toContain("there's no need to request another");
    expect(loginPage).not.toContain("For security purposes, you can only request this after");
  });

  it("removes every reachable password and recovery surface", () => {
    expect(loginPage).not.toContain("signInWithPassword");
    expect(loginPage).not.toContain("resetPasswordForEmail");
    expect(loginPage).not.toContain('type="password"');
    expect(existsSync(resolve(root, "app/admin/recover/page.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "app/admin/update-password/page.tsx"))).toBe(false);
  });

  it("configures a six-digit near-ceiling OTP and a code-only email", () => {
    expect(authConfig).toMatch(/\[auth\][\s\S]*enable_signup = false/);
    expect(authConfig).toContain("otp_length = 6");
    expect(authConfig).toContain("otp_expiry = 86400");
    expect(authConfig).toContain("[auth.email.template.magic_link]");
    expect(authConfig).toContain('subject = "{{ .Token }} is your Onzio sign-in code"');
    expect(magicLinkTemplate).toContain("{{ .Token }}");
    expect(magicLinkTemplate).not.toContain("{{ .ConfirmationURL }}");
    expect(magicLinkTemplate).not.toContain("<a ");
  });

  it("provides a guarded private operator TOTP enrollment command", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const enrollmentPath = resolve(root, "scripts/enroll-operator-totp.ts");
    expect(packageJson.scripts?.["operator:enroll-totp"]).toBe(
      "tsx scripts/enroll-operator-totp.ts",
    );
    expect(existsSync(enrollmentPath)).toBe(true);
    const enrollment = read("scripts/enroll-operator-totp.ts");
    expect(enrollment).toContain("loadEnvConfig");
    expect(enrollment).toContain("fxefqnoqxbezeccjvrsw");
    expect(enrollment).toContain("ONZIO_OPERATOR_SUPABASE_PUBLISHABLE_KEY");
    expect(enrollment).toContain("Staging publishable key");
    expect(enrollment).toContain('import WebSocket from "ws"');
    expect(enrollment).toContain("realtime: { transport: WebSocket as any }");
    expect(enrollment).toContain('payload.role !== "anon"');
    expect(enrollment).toContain('key.startsWith("sb_secret_")');
    expect(enrollment).toContain("stdin.isTTY");
    expect(enrollment).toContain("ONZIO_STAGING_OPERATOR_USER_IDS");
    expect(enrollment).toContain("shouldCreateUser: false");
    expect(enrollment).toContain("auth.mfa.listFactors");
    expect(enrollment).toContain("auth.mfa.enroll");
    expect(enrollment).toContain("auth.mfa.challengeAndVerify");
    expect(enrollment).toContain("getAuthenticatorAssuranceLevel");
    expect(enrollment).toContain("mkdtemp");
    expect(enrollment).toContain("mode: 0o600");
    expect(enrollment).toContain("rm(");
    expect(enrollment).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("provides a guarded staging operator AAL1 and AAL2 acceptance command", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const verifierPath = resolve(
      root,
      "scripts/verify-operator-staging-auth.ts",
    );
    expect(packageJson.scripts?.["operator:verify-staging-auth"]).toBe(
      "tsx scripts/verify-operator-staging-auth.ts",
    );
    expect(existsSync(verifierPath)).toBe(true);

    const verifier = read("scripts/verify-operator-staging-auth.ts");
    expect(verifier).toContain("loadEnvConfig");
    expect(verifier).toContain("fxefqnoqxbezeccjvrsw");
    expect(verifier).toContain("ONZIO_OPERATOR_SUPABASE_PUBLISHABLE_KEY");
    expect(verifier).toContain("ONZIO_STAGING_OPERATOR_USER_IDS");
    expect(verifier).toContain("shouldCreateUser: false");
    expect(verifier.match(/signInWithOtp/g)).toHaveLength(1);
    expect(verifier).toContain("verifyAccessTokenClaims");
    expect(verifier).toContain("assertOperator");
    expect(verifier).toContain("OPERATOR_AAL2_REQUIRED");
    expect(verifier).toContain("auth.mfa.listFactors");
    expect(verifier).toContain("auth.mfa.challengeAndVerify");
    expect(verifier).toContain('currentLevel !== "aal2"');
    expect(verifier).toContain('scope: "local"');
    expect(verifier).toContain("operator.staging_auth_verified");
    expect(verifier).toContain("stdin.isTTY");
    expect(verifier).toContain('key.startsWith("sb_secret_")');
    expect(verifier).not.toContain("auth.mfa.enroll");
    expect(verifier).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("documents operator-only break-glass recovery without restoring club MFA", () => {
    const phasePlan = read("docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md");
    const recoveryPath = resolve(
      root,
      "docs/phase-12/OPERATOR-TOTP-RECOVERY.md",
    );
    expect(existsSync(recoveryPath)).toBe(true);
    const recovery = read("docs/phase-12/OPERATOR-TOTP-RECOVERY.md");
    expect(phasePlan).toContain("no operator-reachable policy exists");
    expect(phasePlan).not.toContain("Retain `is_aal2()` on operator-reachable paths");
    expect(recovery).toContain("Revoke sessions first");
    expect(recovery).toContain("Remove only the approved factor");
    expect(recovery).toContain("Write the audit event");
    expect(existsSync(resolve(root, "lib/operator/mfa-recovery.ts"))).toBe(false);
  });
});

describe("PLAT-101 AMR session contract", () => {
  const now = new Date("2026-08-03T18:00:00.000Z");
  const timestamp = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  it("uses the earliest valid AMR timestamp as the club session start", () => {
    expect(
      clubSessionStartedAt({
        amr: [
          { method: "token_refresh", timestamp: timestamp("2026-08-03T17:00:00Z") },
          { method: "otp", timestamp: timestamp("2026-07-20T12:00:00Z") },
        ],
      }),
    ).toEqual(new Date("2026-07-20T12:00:00.000Z"));
  });

  it("accepts a 30-day club session and rejects an older or malformed one", () => {
    expect(
      isClubSessionFresh(
        { amr: [{ method: "otp", timestamp: timestamp("2026-07-05T18:00:00Z") }] },
        now,
      ),
    ).toBe(true);
    expect(
      isClubSessionFresh(
        { amr: [{ method: "otp", timestamp: timestamp("2026-07-04T17:59:59Z") }] },
        now,
      ),
    ).toBe(false);
    expect(isClubSessionFresh({ amr: [{ method: "otp", timestamp: "bad" }] }, now)).toBe(false);
  });

  it("uses the TOTP AMR timestamp, not token issue time, for operator age", () => {
    expect(
      operatorTotpVerifiedAt({
        aal: "aal2",
        iat: timestamp("2026-08-03T17:59:00Z"),
        amr: [
          { method: "otp", timestamp: timestamp("2026-08-03T12:00:00Z") },
          { method: "totp", timestamp: timestamp("2026-08-03T16:30:00Z") },
        ],
      }),
    ).toEqual(new Date("2026-08-03T16:30:00.000Z"));
  });

  it("accepts only claims returned by getClaims and fails closed on its error", async () => {
    const claims = {
      sub: "11111111-1111-4111-8111-111111111111",
      aal: "aal2",
      amr: [{ method: "totp", timestamp: timestamp("2026-08-03T16:30:00Z") }],
    };
    const getUser = vi.fn();
    const getClaims = vi
      .fn()
      .mockResolvedValueOnce({ data: { claims }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("JWKS unavailable") });
    const client = {
      auth: { getClaims, getUser },
    } as unknown as Parameters<typeof verifyAccessTokenClaims>[0];

    await expect(verifyAccessTokenClaims(client, "verified-token")).resolves.toEqual(
      claims,
    );
    await expect(verifyAccessTokenClaims(client, "unverified-token")).resolves.toBeNull();
    expect(getClaims).toHaveBeenNthCalledWith(1, "verified-token");
    expect(getClaims).toHaveBeenNthCalledWith(2, "unverified-token");
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("PLAT-101 privileged membership boundary", () => {
  it("binds operator calls to a verified access token rather than actorId", () => {
    const shared = read("lib/operator/shared.ts");
    const session = read("lib/auth-session.ts");
    expect(shared).toContain("operatorAccessToken");
    expect(shared).toContain("verifyAccessTokenClaims");
    expect(session).toContain("auth.getClaims");
    expect(shared).not.toContain("assertOperator(actorId: string)");
  });

  it("ships an owner-only admin membership route without exposing owner transfer", () => {
    const route = read("app/api/admin/members/route.ts");
    const page = read("app/admin/(protected)/members/page.tsx");
    expect(route).toContain("assertClubOwnerSession");
    expect(route).toContain('role: "admin"');
    expect(route).not.toContain('role: "owner"');
    expect(page).toContain("Team access");
    expect(page).toContain("Add administrator");
  });

  it("turns the Auth email cooldown into a retryable membership response", () => {
    const membership = read("lib/owner-admin-membership.ts");
    const route = read("app/api/admin/members/route.ts");
    const page = read("app/admin/(protected)/members/page.tsx");
    expect(membership).toContain('code.error.code === "over_email_send_rate_limit"');
    expect(membership).toContain('failContract("AUTH_CODE_RATE_LIMITED")');
    expect(route).toContain('code === "AUTH_CODE_RATE_LIMITED"');
    expect(route).toContain("? 429");
    expect(page).toContain("Wait one minute, then try adding this administrator again.");
  });
});

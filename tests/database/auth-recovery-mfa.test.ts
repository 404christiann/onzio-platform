import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { currentTotp } from "../helpers/mfa";

const nodeWebSocket =
  WebSocket as unknown as typeof globalThis.WebSocket;

describe("password recovery with an enrolled MFA factor", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("requires and accepts an MFA challenge before updating the password", async () => {
    const { supabaseUrl } = assertSafeTestEnvironment();
    const anonKey = process.env.SUPABASE_TEST_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
    const sharedOptions = {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: nodeWebSocket },
    } as const;
    const service = createClient(supabaseUrl, serviceKey, sharedOptions);
    const email = `recovery-mfa-${randomUUID()}@onzio.local`;
    const initialPassword = `local-initial-${randomUUID()}`;
    const updatedPassword = `local-updated-${randomUUID()}`;

    const created = await service.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    cleanup = async () => {
      await service.auth.admin.deleteUser(created.data.user.id);
    };

    const enrollmentClient = createClient(
      supabaseUrl,
      anonKey,
      sharedOptions,
    );
    const signIn = await enrollmentClient.auth.signInWithPassword({
      email,
      password: initialPassword,
    });
    if (signIn.error) throw signIn.error;

    const enrollment = await enrollmentClient.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `recovery-contract-${randomUUID()}`,
    });
    if (enrollment.error) throw enrollment.error;
    const enrolled = await enrollmentClient.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id,
      code: currentTotp(enrollment.data.totp.secret),
    });
    if (enrolled.error) throw enrolled.error;
    await enrollmentClient.auth.signOut();

    const link = await service.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (link.error) throw link.error;

    const recoveryClient = createClient(supabaseUrl, anonKey, sharedOptions);
    const recovered = await recoveryClient.auth.verifyOtp({
      email,
      token: link.data.properties.email_otp,
      type: "recovery",
    });
    if (recovered.error) throw recovered.error;

    const initialAssurance =
      await recoveryClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (initialAssurance.error) throw initialAssurance.error;
    expect(initialAssurance.data.currentLevel).toBe("aal1");
    expect(initialAssurance.data.nextLevel).toBe("aal2");

    const blockedUpdate = await recoveryClient.auth.updateUser({
      password: updatedPassword,
    });
    expect(blockedUpdate.error?.message).toContain("AAL2 session is required");

    const factors = await recoveryClient.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const verifiedFactor = factors.data.totp.find(
      (factor) => factor.status === "verified",
    );
    expect(verifiedFactor?.id).toBe(enrollment.data.id);

    const verified = await recoveryClient.auth.mfa.challengeAndVerify({
      factorId: verifiedFactor!.id,
      code: currentTotp(enrollment.data.totp.secret),
    });
    if (verified.error) throw verified.error;

    const elevatedAssurance =
      await recoveryClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (elevatedAssurance.error) throw elevatedAssurance.error;
    expect(elevatedAssurance.data.currentLevel).toBe("aal2");

    const updated = await recoveryClient.auth.updateUser({
      password: updatedPassword,
    });
    expect(updated.error).toBeNull();
  });
});

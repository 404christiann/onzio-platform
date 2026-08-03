import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for operator sign-in`);
  return value;
}

export async function acquireOperatorAccessToken(): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Operator sign-in requires an interactive terminal");
  }

  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    requiredEnvironment("SUPABASE_ANON_KEY");
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth;
  const prompt = createInterface({ input: stdin, output: stdout });

  try {
    const email = (await prompt.question("Operator email: "))
      .trim()
      .toLowerCase();
    const request = await auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (request.error) throw request.error;

    const emailCode = (await prompt.question("Six-digit email code: ")).trim();
    if (!/^\d{6}$/.test(emailCode)) throw new Error("Invalid email code format");
    const verification = await auth.verifyOtp({
      email,
      token: emailCode,
      type: "email",
    });
    if (verification.error) throw verification.error;

    const factors = await auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const factor = factors.data.totp.find(
      (candidate) => candidate.status === "verified",
    );
    if (!factor) {
      throw new Error("The operator account must enroll and verify TOTP first");
    }

    const totpCode = (await prompt.question("Six-digit TOTP code: ")).trim();
    if (!/^\d{6}$/.test(totpCode)) throw new Error("Invalid TOTP code format");
    const challenge = await auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totpCode,
    });
    if (challenge.error) throw challenge.error;

    const session = await auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (session.error || !accessToken) {
      throw session.error ?? new Error("Verified operator session is missing");
    }
    return accessToken;
  } finally {
    prompt.close();
  }
}

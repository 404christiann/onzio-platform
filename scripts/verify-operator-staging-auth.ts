import { stdin, stdout } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { verifyAccessTokenClaims } from "@/lib/auth-session";
import { ContractError } from "@/lib/contract-error";
import { revokeOperatorSession } from "@/lib/operator/revoke-session";
import { assertOperator } from "@/lib/operator/shared";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_HOSTNAME = `${EXPECTED_PROJECT_REF}.supabase.co`;
const EXPECTED_URL = `https://${EXPECTED_HOSTNAME}`;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertPublicClientKey(key: string): string {
  if (key.startsWith("sb_secret_")) {
    throw new Error("Refusing to use a Supabase secret key for operator acceptance");
  }
  if (key.startsWith("sb_publishable_")) return key;

  try {
    const [, encodedPayload] = key.split(".");
    if (!encodedPayload) throw new Error("Missing JWT payload");
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { role?: unknown };
    if (payload.role !== "anon") {
      throw new Error("Legacy key is not an anon key");
    }
    return key;
  } catch {
    throw new Error(
      "ONZIO_OPERATOR_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key; never use a secret or service-role key",
    );
  }
}

async function operatorPublicClientKey(prompt: Interface): Promise<string> {
  const dedicated = process.env.ONZIO_OPERATOR_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (dedicated) return assertPublicClientKey(dedicated);

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (configuredUrl) {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol === "https:" && parsed.hostname === EXPECTED_HOSTNAME) {
      const existing =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
        process.env.SUPABASE_ANON_KEY?.trim();
      if (existing) return assertPublicClientKey(existing);
    }
  }

  stdout.write(
    "The app environment targets local Supabase. In staging, open Settings > API Keys and copy only the Publishable key. Never use a Secret or service_role key.\n",
  );
  const entered = (await prompt.question("Staging publishable key: ")).trim();
  return assertPublicClientKey(entered);
}

function stagingOperatorUserIds(): Set<string> {
  const configured = requiredEnvironment("ONZIO_STAGING_OPERATOR_USER_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length !== 1) {
    throw new Error("Expected exactly one configured staging operator user ID");
  }
  return new Set(configured);
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Operator staging acceptance requires an interactive terminal");
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  let auth: ReturnType<typeof createClient>["auth"] | null = null;
  let acceptanceSession: {
    accessToken: string;
    refreshToken: string;
  } | null = null;
  const originalOperatorUserIds = process.env.ONZIO_OPERATOR_USER_IDS;

  try {
    stdout.write(
      `This sends exactly one operator email code to ${EXPECTED_PROJECT_REF}, proves the real operator gate rejects AAL1, proves a fresh TOTP step-up reaches AAL2, and performs no operator data mutation.\n`,
    );
    const confirmation = (
      await prompt.question(`Type ${EXPECTED_PROJECT_REF} to continue: `)
    ).trim();
    if (confirmation !== EXPECTED_PROJECT_REF) {
      throw new Error("Staging project confirmation did not match");
    }

    const publicClientKey = await operatorPublicClientKey(prompt);
    const allowedUserIds = stagingOperatorUserIds();
    process.env.ONZIO_OPERATOR_USER_IDS = [...allowedUserIds].join(",");

    const client = createClient(EXPECTED_URL, publicClientKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: { transport: WebSocket as any },
    });
    auth = client.auth;

    const email = (await prompt.question("Operator email: ")).trim().toLowerCase();
    const requested = await auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (requested.error) throw requested.error;

    const emailCode = (await prompt.question("Six-digit email code: ")).trim();
    if (!/^\d{6}$/.test(emailCode)) throw new Error("Invalid email code format");
    const verifiedEmail = await auth.verifyOtp({
      email,
      token: emailCode,
      type: "email",
    });
    if (verifiedEmail.error) throw verifiedEmail.error;

    const aal1AccessToken = verifiedEmail.data.session?.access_token;
    const aal1RefreshToken = verifiedEmail.data.session?.refresh_token;
    const userId = verifiedEmail.data.user?.id;
    if (!aal1AccessToken || !aal1RefreshToken || !userId) {
      throw new Error("Verified operator AAL1 session is missing");
    }
    acceptanceSession = {
      accessToken: aal1AccessToken,
      refreshToken: aal1RefreshToken,
    };
    if (!allowedUserIds.has(userId)) {
      throw new Error("The signed-in user is not an allowlisted Onzio operator");
    }

    const operatorDependencies = {
      verifyOperatorAccessToken: async (accessToken: string) => {
        const claims = await verifyAccessTokenClaims(client, accessToken);
        if (!claims) throw new Error("Operator access token verification failed");
        return claims;
      },
    };

    try {
      await assertOperator(aal1AccessToken, operatorDependencies);
      throw new Error("Operator gate unexpectedly accepted an AAL1 session");
    } catch (error) {
      if (!(error instanceof ContractError) || error.code !== "OPERATOR_AAL2_REQUIRED") {
        throw error;
      }
    }
    stdout.write("Operator gate correctly refused the AAL1 session.\n");

    const factors = await auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    if (factors.data.all.length !== 1 || factors.data.totp.length !== 1) {
      throw new Error("Expected exactly one verified TOTP factor and no other factors");
    }
    const factor = factors.data.totp[0]!;

    const totpCode = (await prompt.question("Six-digit TOTP code: ")).trim();
    if (!/^\d{6}$/.test(totpCode)) throw new Error("Invalid TOTP code format");
    const challenge = await auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totpCode,
    });
    if (challenge.error) throw challenge.error;
    if (!challenge.data.refresh_token) {
      throw new Error("Verified operator AAL2 refresh token is missing");
    }
    acceptanceSession = {
      accessToken: aal1AccessToken,
      refreshToken: challenge.data.refresh_token,
    };

    const assurance = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== "aal2") {
      throw assurance.error ?? new Error("Operator session did not reach AAL2");
    }
    const accepted = await assertOperator(
      challenge.data.access_token,
      operatorDependencies,
    );
    if (accepted.actorId !== userId) {
      throw new Error("Operator gate returned the wrong verified actor");
    }

    const revocation = await revokeOperatorSession(auth, acceptanceSession);
    auth = null;
    acceptanceSession = null;

    stdout.write(
      `${JSON.stringify({
        event: "operator.staging_auth_verified",
        projectRef: EXPECTED_PROJECT_REF,
        aal1Refused: true,
        aal2Accepted: true,
        verifiedTotpFactors: 1,
        acceptanceSessionRevoked:
          revocation.revoked && revocation.refreshRejected,
        operatorDataMutations: 0,
      })}\n`,
    );
  } finally {
    let cleanupError: Error | null = null;
    if (auth && acceptanceSession) {
      try {
        await revokeOperatorSession(auth, acceptanceSession);
      } catch {
        cleanupError = new Error("Operator acceptance session cleanup failed");
      }
    }
    if (originalOperatorUserIds === undefined) {
      delete process.env.ONZIO_OPERATOR_USER_IDS;
    } else {
      process.env.ONZIO_OPERATOR_USER_IDS = originalOperatorUserIds;
    }
    prompt.close();
    if (cleanupError) throw cleanupError;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown acceptance failure";
  process.stderr.write(`Operator staging acceptance failed: ${message}\n`);
  process.exitCode = 1;
});

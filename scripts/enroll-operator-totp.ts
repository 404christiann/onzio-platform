import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_HOSTNAME = `${EXPECTED_PROJECT_REF}.supabase.co`;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertExactStagingProject(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== EXPECTED_HOSTNAME) {
    throw new Error(
      `Refusing TOTP enrollment outside Supabase staging project ${EXPECTED_PROJECT_REF}`,
    );
  }
}

function operatorUserIds(): Set<string> {
  return new Set(
    requiredEnvironment("ONZIO_OPERATOR_USER_IDS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function decodeQrCode(dataUri: string): Buffer {
  if (dataUri.trimStart().startsWith("<svg")) {
    return Buffer.from(dataUri, "utf8");
  }
  const match = dataUri.match(
    /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]+)$/i,
  );
  const payload = match?.[2];
  if (!payload) {
    throw new Error("Supabase returned an unsupported TOTP QR format");
  }
  return match[1]
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
}

async function openPrivateQr(path: string): Promise<void> {
  if (process.platform !== "darwin") {
    stdout.write(`Open this temporary QR file locally: ${path}\n`);
    return;
  }
  const child = spawn("open", [path], { stdio: "ignore" });
  const [code] = (await once(child, "exit")) as [number | null];
  if (code !== 0) {
    stdout.write(`Open this temporary QR file locally: ${path}\n`);
  }
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Operator TOTP enrollment requires an interactive terminal");
  }

  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  assertExactStagingProject(url);
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    requiredEnvironment("SUPABASE_ANON_KEY");
  const allowedUserIds = operatorUserIds();
  const auth = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth;
  const prompt = createInterface({ input: stdin, output: stdout });
  let temporaryDirectory: string | null = null;
  let enrolledFactorId: string | null = null;
  let enrollmentVerified = false;

  try {
    stdout.write(
      `This will send one email code and enroll one TOTP factor on ${EXPECTED_PROJECT_REF}.\n`,
    );
    const confirmation = (
      await prompt.question(`Type ${EXPECTED_PROJECT_REF} to continue: `)
    ).trim();
    if (confirmation !== EXPECTED_PROJECT_REF) {
      throw new Error("Staging project confirmation did not match");
    }

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

    const currentUser = await auth.getUser();
    if (currentUser.error || !currentUser.data.user) {
      throw currentUser.error ?? new Error("Verified operator user is missing");
    }
    if (!allowedUserIds.has(currentUser.data.user.id)) {
      throw new Error("The signed-in user is not an allowlisted Onzio operator");
    }

    const existing = await auth.mfa.listFactors();
    if (existing.error) throw existing.error;
    const verifiedFactors = existing.data.totp.filter(
      (factor) => factor.status === "verified",
    );
    if (verifiedFactors.length > 0) {
      stdout.write("A verified TOTP factor already exists; no factor was added.\n");
      return;
    }
    if (existing.data.totp.length > 0) {
      throw new Error(
        "An unverified TOTP factor already exists; inspect it before retrying enrollment",
      );
    }

    const enrollment = await auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Onzio Operator",
    });
    if (enrollment.error) throw enrollment.error;
    enrolledFactorId = enrollment.data.id;

    temporaryDirectory = await mkdtemp(join(tmpdir(), "onzio-operator-totp-"));
    const qrPath = join(temporaryDirectory, "operator-totp.svg");
    await writeFile(qrPath, decodeQrCode(enrollment.data.totp.qr_code), {
      mode: 0o600,
    });
    await openPrivateQr(qrPath);

    stdout.write(
      "Scan the QR in your authenticator app. Do not paste the QR, secret, or code into chat.\n",
    );
    const totpCode = (await prompt.question("Six-digit authenticator code: ")).trim();
    if (!/^\d{6}$/.test(totpCode)) throw new Error("Invalid TOTP code format");
    const challenge = await auth.mfa.challengeAndVerify({
      factorId: enrolledFactorId,
      code: totpCode,
    });
    if (challenge.error) throw challenge.error;

    const assurance = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== "aal2") {
      throw assurance.error ?? new Error("Operator session did not reach AAL2");
    }
    const finalFactors = await auth.mfa.listFactors();
    if (finalFactors.error) throw finalFactors.error;
    const finalVerified = finalFactors.data.totp.filter(
      (factor) => factor.status === "verified",
    );
    if (finalVerified.length !== 1 || finalVerified[0]?.id !== enrolledFactorId) {
      throw new Error("Expected exactly one verified operator TOTP factor");
    }

    enrollmentVerified = true;
    stdout.write("Operator TOTP enrollment verified at AAL2.\n");
  } finally {
    if (enrolledFactorId && !enrollmentVerified) {
      const cleanup = await auth.mfa.unenroll({ factorId: enrolledFactorId });
      if (cleanup.error) {
        stdout.write(
          "Enrollment did not finish and the unverified factor could not be removed automatically.\n",
        );
      }
    }
    await auth.signOut({ scope: "local" });
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    prompt.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown enrollment failure";
  process.stderr.write(`Operator TOTP enrollment failed: ${message}\n`);
  process.exitCode = 1;
});

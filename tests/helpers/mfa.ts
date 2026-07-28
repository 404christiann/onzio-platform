import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { assertSafeTestEnvironment } from "./environment";

const nodeWebSocket =
  WebSocket as unknown as typeof globalThis.WebSocket;

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/g, "");
  let bits = "";

  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error(`Invalid base32 character: ${character}`);
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function currentTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBytes)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

export async function createAal2LocalClient(params: {
  email: string;
  userId: string;
}): Promise<{
  client: SupabaseClient<any, any, any>;
  cleanup: () => Promise<void>;
}> {
  const { supabaseUrl } = assertSafeTestEnvironment();
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ?? "local-anon-key-not-configured";
  const serviceKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
    "local-service-role-key-not-configured";
  const sharedOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: nodeWebSocket },
  } as const;
  const service = createClient(supabaseUrl, serviceKey, sharedOptions);

  const existing = await service.auth.admin.mfa.listFactors({
    userId: params.userId,
  });
  if (existing.error) throw existing.error;
  for (const factor of existing.data?.factors ?? []) {
    const deletion = await service.auth.admin.mfa.deleteFactor({
      userId: params.userId,
      id: factor.id,
    });
    if (deletion.error) throw deletion.error;
  }

  const client = createClient(supabaseUrl, anonKey, {
    ...sharedOptions,
    db: { schema: "onzio" },
  });
  const signIn = await client.auth.signInWithPassword({
    email: params.email,
    password: "local-contract-only",
  });
  if (signIn.error) throw signIn.error;

  const enrollment = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `contract-${randomUUID()}`,
  });
  if (enrollment.error) throw enrollment.error;

  const verification = await client.auth.mfa.challengeAndVerify({
    factorId: enrollment.data.id,
    code: currentTotp(enrollment.data.totp.secret),
  });
  if (verification.error) throw verification.error;

  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) throw assurance.error;
  if (assurance.data.currentLevel !== "aal2") {
    throw new Error("Expected the local contract session to reach AAL2.");
  }

  return {
    client,
    cleanup: async () => {
      await service.auth.admin.mfa.deleteFactor({
        userId: params.userId,
        id: enrollment.data.id,
      });
      await client.auth.signOut();
    },
  };
}

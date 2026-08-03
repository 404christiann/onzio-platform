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

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export async function createFreshLocalClient(params: {
  email: string;
  userId: string;
}): Promise<{
  client: SupabaseClient<any, any, any>;
  cleanup: () => Promise<void>;
}> {
  const { supabaseUrl } = assertSafeTestEnvironment();
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ?? "local-anon-key-not-configured";
  const sharedOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: nodeWebSocket },
  } as const;
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: `${supabaseUrl}/auth/v1`,
    aud: "authenticated",
    exp: now + 3_600,
    iat: now,
    sub: params.userId,
    role: "authenticated",
    aal: "aal1",
    session_id: randomUUID(),
    email: params.email,
    amr: [{ method: "otp", timestamp: now }],
  });
  const unsigned = `${header}.${payload}`;
  const secret =
    process.env.SUPABASE_TEST_JWT_SECRET ??
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const token = `${unsigned}.${createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64url")}`;
  const client = createClient(supabaseUrl, anonKey, {
    ...sharedOptions,
    db: { schema: "onzio" },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return {
    client,
    cleanup: async () => {},
  };
}

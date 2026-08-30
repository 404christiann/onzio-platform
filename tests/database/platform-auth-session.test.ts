import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { expectPostgrestError } from "../helpers/database-security";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createLocalClients } from "../helpers/supabase";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function localAccessToken(input: {
  userId: string;
  email: string;
  amrTimestamp: number | string;
}): string {
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "http://127.0.0.1:54321/auth/v1",
    aud: "authenticated",
    exp: now + 3_600,
    iat: now,
    sub: input.userId,
    role: "authenticated",
    aal: "aal1",
    session_id: randomUUID(),
    email: input.email,
    phone: "",
    is_anonymous: false,
    amr: [{ method: "otp", timestamp: input.amrTimestamp }],
  });
  const unsigned = `${header}.${payload}`;
  const secret =
    process.env.SUPABASE_TEST_JWT_SECRET ??
    "super-secret-jwt-token-with-at-least-32-characters-long";
  const signature = createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function authenticatedClient(token: string) {
  const { supabaseUrl } = assertSafeTestEnvironment();
  return createClient(supabaseUrl, process.env.SUPABASE_TEST_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "onzio" },
    global: { headers: { Authorization: `Bearer ${token}` } },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
}

describe("PLAT-101 club session age RLS", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("allows fresh aal1 content access and rejects sessions older than 30 days", async () => {
    const { service } = createLocalClients();
    const userId = randomUUID();
    const clubId = randomUUID();
    const email = `plat-101-${userId}@onzio.local`;
    const slug = `plat-101-${clubId.slice(0, 8)}`;

    const created = await service.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true,
    });
    if (created.error) throw created.error;

    const club = await service.from("clubs").insert({
      id: clubId,
      slug,
      name: "PLAT-101 Session Fixture",
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
    });
    if (club.error) throw club.error;
    const membership = await service.from("club_members").insert({
      club_id: clubId,
      user_id: userId,
      role: "owner",
      status: "active",
    });
    if (membership.error) throw membership.error;

    cleanup.push(async () => {
      await service.from("audit_events").delete().eq("club_id", clubId);
      await service.from("site_social_links").delete().eq("club_id", clubId);
      await service.from("club_members").delete().eq("club_id", clubId);
      await service.from("clubs").delete().eq("id", clubId);
      await service.auth.admin.deleteUser(userId, false);
    });

    const now = Math.floor(Date.now() / 1_000);
    const fresh = authenticatedClient(
      localAccessToken({ userId, email, amrTimestamp: now - 29 * 86_400 }),
    );
    const stale = authenticatedClient(
      localAccessToken({ userId, email, amrTimestamp: now - 31 * 86_400 }),
    );
    const malformed = authenticatedClient(
      localAccessToken({ userId, email, amrTimestamp: "not-a-timestamp" }),
    );

    const freshMembership = await fresh
      .from("club_members")
      .select("club_id,role,status")
      .eq("club_id", clubId)
      .single();
    expect(freshMembership.error).toBeNull();
    expect(freshMembership.data).toMatchObject({ role: "owner", status: "active" });

    const freshInsert = await fresh.from("site_social_links").insert({
      club_id: clubId,
      id: "instagram",
      label: "Instagram",
      href: "https://instagram.com/plat101",
      icon: "instagram",
      sort_order: 0,
    });
    expect(freshInsert.error).toBeNull();

    const staleRead = await stale
      .from("club_members")
      .select("club_id")
      .eq("club_id", clubId);
    expect(staleRead.error).toBeNull();
    expect(staleRead.data).toEqual([]);

    const staleInsert = await stale.from("site_social_links").insert({
      club_id: clubId,
      id: "x",
      label: "X",
      href: "https://x.com/plat101",
      icon: "x",
      sort_order: 1,
    });
    expectPostgrestError(staleInsert.error, "42501", "stale club session write");

    const malformedRead = await malformed
      .from("club_members")
      .select("club_id")
      .eq("club_id", clubId);
    expect(malformedRead.error).toBeNull();
    expect(malformedRead.data).toEqual([]);
  });
});

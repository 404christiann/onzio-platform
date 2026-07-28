import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { validTransparentPng } from "../fixtures/media";
import { createAal2LocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  await clients.service
    .from("clubs")
    .update({ lifecycle: "onboarding", public_access: "preview" })
    .eq("id", CLUB_IDS.bravo);
});

describe("authenticated tenant RLS contract", () => {
  it("resolves private-preview admin hosts without exposing tenant rows", async () => {
    const directClub = await clients.anon
      .from("clubs")
      .select("id")
      .eq("id", CLUB_IDS.bravo);
    const directDomain = await clients.anon
      .from("club_domains")
      .select("club_id")
      .eq("hostname", "bravo-onzio.vercel.app");
    expect(directClub.data).toEqual([]);
    expect(directDomain.data).toEqual([]);

    const resolved = await clients.anon.rpc("resolve_verified_tenant", {
      p_hostname: "BRAVO-ONZIO.VERCEL.APP.",
      p_environment: "production",
    });
    expect(resolved.error?.message).toBeUndefined();
    expect(resolved.data).toEqual([
      {
        id: CLUB_IDS.bravo,
        slug: "bravo",
        lifecycle: "onboarding",
        public_access: "preview",
      },
    ]);

    const wrongEnvironment = await clients.anon.rpc(
      "resolve_verified_tenant",
      {
        p_hostname: "bravo-onzio.vercel.app",
        p_environment: "staging",
      },
    );
    expect(wrongEnvironment.data).toEqual([]);
  });

  it("allows AAL2 member writes only inside the member's club", async () => {
    const session = await createAal2LocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const allowed = await session.client.from("site_social_links").insert({
      club_id: CLUB_IDS.alpha,
      id: "aal2-alpha-contract",
      label: "Allowed",
      href: "https://example.test",
      icon: "test",
    });
    expect(allowed.error?.message).toBeUndefined();

    const crossClub = await session.client.from("site_social_links").insert({
      club_id: CLUB_IDS.bravo,
      id: "aal2-bravo-forged",
      label: "Denied",
      href: "https://example.test",
      icon: "test",
    });
    expect(crossClub.error).not.toBeNull();

    await clients.service
      .from("site_social_links")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", "aal2-alpha-contract");
  });

  it("rejects content writes from an AAL1 owner session", async () => {
    const { supabaseUrl } = await import("../helpers/environment").then(
      ({ assertSafeTestEnvironment }) => assertSafeTestEnvironment(),
    );
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      supabaseUrl,
      process.env.SUPABASE_TEST_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: "onzio" },
        realtime: {
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      },
    );
    const signIn = await client.auth.signInWithPassword({
      email: "owner-aal1@alpha.local",
      password: "local-contract-only",
    });
    expect(signIn.error?.message).toBeUndefined();

    const write = await client.from("site_social_links").insert({
      club_id: CLUB_IDS.alpha,
      id: "aal1-forged-write",
      label: "Denied",
      href: "https://example.test",
      icon: "test",
    });
    expect(write.error).not.toBeNull();
    await client.auth.signOut();
  });
});

describe("tier-aware database and Storage contract", () => {
  it("allows Starter branding but denies Starter Pro-only shop writes", async () => {
    await clients.service
      .from("clubs")
      .update({ lifecycle: "active" })
      .eq("id", CLUB_IDS.bravo);
    const session = await createAal2LocalClient({
      email: "multiclub@local.test",
      userId: USER_IDS.multiClub,
    });
    cleanups.push(session.cleanup);

    const branding = await session.client.from("site_social_links").insert({
      club_id: CLUB_IDS.bravo,
      id: "starter-branding-contract",
      label: "Allowed",
      href: "https://example.test",
      icon: "test",
    });
    expect(branding.error?.message).toBeUndefined();

    const shop = await session.client.from("shop_kit_section").insert({
      club_id: CLUB_IDS.bravo,
      surface: "shop",
      kit_variant: "home",
    });
    expect(shop.error).not.toBeNull();

    await clients.service
      .from("site_social_links")
      .delete()
      .eq("club_id", CLUB_IDS.bravo)
      .eq("id", "starter-branding-contract");
  });

  it("enforces Starter entitlement on staging upload surfaces", async () => {
    await clients.service
      .from("clubs")
      .update({ lifecycle: "active" })
      .eq("id", CLUB_IDS.bravo);
    const session = await createAal2LocalClient({
      email: "multiclub@local.test",
      userId: USER_IDS.multiClub,
    });
    cleanups.push(session.cleanup);

    const brandingPath =
      `${CLUB_IDS.bravo}/branding/99999999-9999-4999-8999-999999999991.png`;
    const branding = await session.client.storage
      .from("onzio-upload-staging")
      .upload(brandingPath, validTransparentPng(), {
        contentType: "image/png",
      });
    expect(branding.error?.message).toBeUndefined();

    const shop = await session.client.storage
      .from("onzio-upload-staging")
      .upload(
        `${CLUB_IDS.bravo}/shop/99999999-9999-4999-8999-999999999992.png`,
        validTransparentPng(),
        { contentType: "image/png" },
      );
    expect(shop.error).not.toBeNull();

    await clients.service.storage
      .from("onzio-upload-staging")
      .remove([brandingPath]);
  });
});

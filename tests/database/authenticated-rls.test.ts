import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { validTransparentPng } from "../fixtures/media";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];
const DCFC_301_PROGRAM_IDS = [
  "66666666-6666-4666-8666-666666666601",
  "66666666-6666-4666-8666-666666666602",
] as const;
const DCFC_301_ALPHA_MEDIA_PATH =
  `${CLUB_IDS.alpha}/programs/66666666-6666-4666-8666-666666666611.png`;
const DCFC_301_BRAVO_MEDIA_PATH =
  `${CLUB_IDS.bravo}/programs/66666666-6666-4666-8666-666666666612.png`;
const DCFC_302_BRAVO_MEDIA_PATH =
  `${CLUB_IDS.bravo}/contact/77777777-7777-4777-8777-777777777701.png`;
const DCFC_303_TRYOUT_IDS = [
  "88888888-8888-4888-8888-888888888801",
  "88888888-8888-4888-8888-888888888802",
] as const;
const DCFC_303_ALPHA_MEDIA_PATH =
  `${CLUB_IDS.alpha}/tryouts/88888888-8888-4888-8888-888888888811.png`;
const DCFC_303_BRAVO_MEDIA_PATH =
  `${CLUB_IDS.bravo}/tryouts/88888888-8888-4888-8888-888888888812.png`;

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  await clients.service
    .from("programs")
    .delete()
    .in("id", [...DCFC_301_PROGRAM_IDS]);
  await clients.service
    .from("tryouts")
    .delete()
    .in("id", [...DCFC_303_TRYOUT_IDS]);
  await clients.service.storage
    .from("onzio-upload-staging")
    .remove([
      DCFC_301_ALPHA_MEDIA_PATH,
      DCFC_301_BRAVO_MEDIA_PATH,
      DCFC_302_BRAVO_MEDIA_PATH,
      DCFC_303_ALPHA_MEDIA_PATH,
      DCFC_303_BRAVO_MEDIA_PATH,
    ]);
  await clients.service
    .from("contact_profile")
    .delete()
    .eq("club_id", CLUB_IDS.bravo);
  await clients.service
    .from("contact_page_content")
    .delete()
    .eq("club_id", CLUB_IDS.bravo);
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

  it("allows fresh aal1 member writes only inside the member's club", async () => {
    const session = await createFreshLocalClient({
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
    expectPostgrestError(
      crossClub.error,
      "42501",
      "aal1 cross-club content insert",
    );

    await clients.service
      .from("site_social_links")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", "aal2-alpha-contract");
  });

  it("allows content writes from a fresh aal1 owner session", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal1@alpha.local",
      userId: USER_IDS.ownerAal1,
    });
    cleanups.push(session.cleanup);

    const write = await session.client.from("site_social_links").insert({
      club_id: CLUB_IDS.alpha,
      id: "aal1-forged-write",
      label: "Allowed",
      href: "https://example.test",
      icon: "test",
    });
    expect(write.error?.message).toBeUndefined();
    await clients.service
      .from("site_social_links")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", "aal1-forged-write");
  });
});

describe("tier-free database and Storage contract", () => {
  it("allows every registered content domain regardless of dormant tier", async () => {
    await clients.service
      .from("clubs")
      .update({ lifecycle: "active" })
      .eq("id", CLUB_IDS.bravo);
    const session = await createFreshLocalClient({
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
    expect(shop.error?.message).toBeUndefined();

    const programs = await session.client.from("programs").insert({
      id: DCFC_301_PROGRAM_IDS[1],
      club_id: CLUB_IDS.bravo,
      slug: "dcfc-301-starter-denied",
      display_title: "Denied",
    });
    expect(programs.error?.message).toBeUndefined();

    const tryouts = await session.client.from("tryouts").insert({
      id: DCFC_303_TRYOUT_IDS[1],
      club_id: CLUB_IDS.bravo,
      headline: "Tier-free Tryouts write",
    });
    expect(tryouts.error?.message).toBeUndefined();

    await clients.service
      .from("site_social_links")
      .delete()
      .eq("club_id", CLUB_IDS.bravo)
      .eq("id", "starter-branding-contract");
    await clients.service
      .from("shop_kit_section")
      .delete()
      .eq("club_id", CLUB_IDS.bravo)
      .eq("surface", "shop");
    await clients.service.from("tryouts").delete().eq("id", DCFC_303_TRYOUT_IDS[1]);
    await clients.service.from("programs").delete().eq("id", DCFC_301_PROGRAM_IDS[1]);
  });

  it("allows every registered staging upload surface regardless of dormant tier", async () => {
    await clients.service
      .from("clubs")
      .update({ lifecycle: "active" })
      .eq("id", CLUB_IDS.bravo);
    const session = await createFreshLocalClient({
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

    const contact = await session.client.storage
      .from("onzio-upload-staging")
      .upload(DCFC_302_BRAVO_MEDIA_PATH, validTransparentPng(), {
        contentType: "image/png",
      });
    expect(contact.error?.message).toBeUndefined();

    const proPrograms = await session.client.storage
      .from("onzio-upload-staging")
      .upload(DCFC_301_ALPHA_MEDIA_PATH, validTransparentPng(), {
        contentType: "image/png",
      });
    expect(proPrograms.error?.message).toBeUndefined();

    const starterPrograms = await session.client.storage
      .from("onzio-upload-staging")
      .upload(DCFC_301_BRAVO_MEDIA_PATH, validTransparentPng(), {
        contentType: "image/png",
      });
    expect(starterPrograms.error?.message).toBeUndefined();

    const proTryouts = await session.client.storage
      .from("onzio-upload-staging")
      .upload(DCFC_303_ALPHA_MEDIA_PATH, validTransparentPng(), {
        contentType: "image/png",
      });
    expect(proTryouts.error?.message).toBeUndefined();

    const starterTryouts = await session.client.storage
      .from("onzio-upload-staging")
      .upload(DCFC_303_BRAVO_MEDIA_PATH, validTransparentPng(), {
        contentType: "image/png",
      });
    expect(starterTryouts.error?.message).toBeUndefined();

    const shop = await session.client.storage
      .from("onzio-upload-staging")
      .upload(
        `${CLUB_IDS.bravo}/shop/99999999-9999-4999-8999-999999999992.png`,
        validTransparentPng(),
        { contentType: "image/png" },
      );
    expect(shop.error?.message).toBeUndefined();

    await clients.service.storage
      .from("onzio-upload-staging")
      .remove([
        brandingPath,
        DCFC_302_BRAVO_MEDIA_PATH,
        DCFC_301_ALPHA_MEDIA_PATH,
        DCFC_301_BRAVO_MEDIA_PATH,
        DCFC_303_ALPHA_MEDIA_PATH,
        DCFC_303_BRAVO_MEDIA_PATH,
        `${CLUB_IDS.bravo}/shop/99999999-9999-4999-8999-999999999992.png`,
      ]);
  });
});

describe("DCFC-302 Contact admin workflow", () => {
  it("lets an AAL2 Starter admin save both Contact ownership singletons", async () => {
    await clients.service
      .from("clubs")
      .update({ lifecycle: "active" })
      .eq("id", CLUB_IDS.bravo);
    const session = await createFreshLocalClient({
      email: "multiclub@local.test",
      userId: USER_IDS.multiClub,
    });
    cleanups.push(session.cleanup);

    const profile = await session.client.from("contact_profile").upsert({
      club_id: CLUB_IDS.bravo,
      public_email: "starter-contact@example.test",
      public_phone: "+1 (847) 555-0199",
      service_area: "Schaumburg, Illinois",
      hours: "Weekdays",
    });
    expect(profile.error?.message).toBeUndefined();

    const page = await session.client.from("contact_page_content").upsert({
      club_id: CLUB_IDS.bravo,
      eyebrow: "Get in touch",
      headline: "Contact the club",
      intro: "Questions about programs and community work are welcome.",
      hero_media_asset_id: null,
    });
    expect(page.error?.message).toBeUndefined();

    const profileUpdate = await session.client
      .from("contact_profile")
      .update({ hours: "Monday-Friday" })
      .eq("club_id", CLUB_IDS.bravo);
    expect(profileUpdate.error?.message).toBeUndefined();

    const [{ data: profiles, error: profileReadError }, { data: pages, error: pageReadError }] =
      await Promise.all([
        session.client
          .from("contact_profile")
          .select("public_email, public_phone, service_area, hours")
          .eq("club_id", CLUB_IDS.bravo),
        session.client
          .from("contact_page_content")
          .select("eyebrow, headline, intro, hero_media_asset_id")
          .eq("club_id", CLUB_IDS.bravo),
      ]);
    expect(profileReadError?.message).toBeUndefined();
    expect(pageReadError?.message).toBeUndefined();
    expect(profiles).toEqual([
      {
        public_email: "starter-contact@example.test",
        public_phone: "+1 (847) 555-0199",
        service_area: "Schaumburg, Illinois",
        hours: "Monday-Friday",
      },
    ]);
    expect(pages).toEqual([
      {
        eyebrow: "Get in touch",
        headline: "Contact the club",
        intro: "Questions about programs and community work are welcome.",
        hero_media_asset_id: null,
      },
    ]);
  });
});

describe("DCFC-301 Programs admin workflow", () => {
  it("lets an AAL2 Pro admin create, edit, and reorder complete program rows", async () => {
    const session = await createFreshLocalClient({
      email: "admin-aal2@alpha.local",
      userId: USER_IDS.adminAal2,
    });
    cleanups.push(session.cleanup);

    const create = await session.client.from("programs").insert([
      {
        id: DCFC_301_PROGRAM_IDS[0],
        club_id: CLUB_IDS.alpha,
        slug: "dcfc-301-first",
        nav_label: "First",
        display_title: "First Program",
        kicker: "Player pathway",
        summary: "First summary",
        body: "First body",
        highlights: ["One", "Two"],
        layout_variant: "statement_band",
        hero_media_asset_id: null,
        detail_media_asset_id: null,
        external_cta_label: "Learn more",
        external_cta_href: "https://registration.example.test/first",
        status: "active",
        sort_order: 0,
      },
      {
        id: DCFC_301_PROGRAM_IDS[1],
        club_id: CLUB_IDS.alpha,
        slug: "dcfc-301-second",
        nav_label: "",
        display_title: "Second Program",
        kicker: "",
        summary: "",
        body: "",
        highlights: [],
        layout_variant: "detail_focus",
        hero_media_asset_id: null,
        detail_media_asset_id: null,
        external_cta_label: "",
        external_cta_href: "",
        status: "hidden",
        sort_order: 1,
      },
    ]);
    expect(create.error?.message).toBeUndefined();

    const edit = await session.client
      .from("programs")
      .update({
        display_title: "First Program Updated",
        highlights: ["One", "Two", "Three"],
        sort_order: 1,
      })
      .eq("id", DCFC_301_PROGRAM_IDS[0]);
    expect(edit.error?.message).toBeUndefined();
    const reorder = await session.client
      .from("programs")
      .update({ sort_order: 0 })
      .eq("id", DCFC_301_PROGRAM_IDS[1]);
    expect(reorder.error?.message).toBeUndefined();

    const { data, error } = await session.client
      .from("programs")
      .select("id, display_title, highlights, layout_variant, status, sort_order")
      .in("id", [...DCFC_301_PROGRAM_IDS])
      .order("sort_order", { ascending: true });
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([
      {
        id: DCFC_301_PROGRAM_IDS[1],
        display_title: "Second Program",
        highlights: [],
        layout_variant: "detail_focus",
        status: "hidden",
        sort_order: 0,
      },
      {
        id: DCFC_301_PROGRAM_IDS[0],
        display_title: "First Program Updated",
        highlights: ["One", "Two", "Three"],
        layout_variant: "statement_band",
        status: "active",
        sort_order: 1,
      },
    ]);
  });
});

describe("DCFC-303 Tryouts admin workflow", () => {
  it("lets an AAL2 Pro admin create, edit, and reorder public-safe event rows", async () => {
    const session = await createFreshLocalClient({
      email: "admin-aal2@alpha.local",
      userId: USER_IDS.adminAal2,
    });
    cleanups.push(session.cleanup);

    const create = await session.client.from("tryouts").insert([
      {
        id: DCFC_303_TRYOUT_IDS[0],
        club_id: CLUB_IDS.alpha,
        program_id: null,
        status: "open",
        eyebrow: "UPSL tryouts",
        headline: "Earn your place",
        intro: "A complete public tryout opportunity.",
        hero_media_asset_id: null,
        eligibility_copy: "Eligible adult players.",
        what_to_expect_copy: "Technical and small-sided evaluation.",
        preparation_copy: "Bring boots and water.",
        event_date: "2026-09-12",
        location: "Alpha Training Ground",
        cost_text: "Contact the club",
        cta_label: "Register externally",
        registration_href: "https://registration.example.test/alpha",
        closed_message: "Registration has closed.",
        sort_order: 0,
      },
      {
        id: DCFC_303_TRYOUT_IDS[1],
        club_id: CLUB_IDS.alpha,
        program_id: null,
        status: "upcoming",
        eyebrow: "",
        headline: "Future opportunity",
        intro: "",
        hero_media_asset_id: null,
        eligibility_copy: "",
        what_to_expect_copy: "",
        preparation_copy: "",
        event_date: null,
        location: "",
        cost_text: "",
        cta_label: "",
        registration_href: "",
        closed_message: "",
        sort_order: 1,
      },
    ]);
    expect(create.error?.message).toBeUndefined();

    const edit = await session.client
      .from("tryouts")
      .update({
        status: "closed",
        closed_message: "The evaluation window is now closed.",
        sort_order: 1,
      })
      .eq("id", DCFC_303_TRYOUT_IDS[0]);
    expect(edit.error?.message).toBeUndefined();
    const reorder = await session.client
      .from("tryouts")
      .update({ sort_order: 0 })
      .eq("id", DCFC_303_TRYOUT_IDS[1]);
    expect(reorder.error?.message).toBeUndefined();

    const { data, error } = await session.client
      .from("tryouts")
      .select(
        "id, status, headline, event_date, location, cost_text, registration_href, closed_message, sort_order",
      )
      .in("id", [...DCFC_303_TRYOUT_IDS])
      .order("sort_order", { ascending: true });
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([
      {
        id: DCFC_303_TRYOUT_IDS[1],
        status: "upcoming",
        headline: "Future opportunity",
        event_date: null,
        location: "",
        cost_text: "",
        registration_href: "",
        closed_message: "",
        sort_order: 0,
      },
      {
        id: DCFC_303_TRYOUT_IDS[0],
        status: "closed",
        headline: "Earn your place",
        event_date: "2026-09-12",
        location: "Alpha Training Ground",
        cost_text: "Contact the club",
        registration_href: "https://registration.example.test/alpha",
        closed_message: "The evaluation window is now closed.",
        sort_order: 1,
      },
    ]);
  });

  it("rejects cross-tenant and unsafe URL writes at real database boundaries", async () => {
    const session = await createFreshLocalClient({
      email: "admin-aal2@alpha.local",
      userId: USER_IDS.adminAal2,
    });
    cleanups.push(session.cleanup);

    const crossTenant = await session.client.from("tryouts").insert({
      id: DCFC_303_TRYOUT_IDS[0],
      club_id: CLUB_IDS.bravo,
      headline: "Forged tenant",
    });
    expectPostgrestError(
      crossTenant.error,
      "42501",
      "AAL2 cross-tenant Tryouts insert",
    );

    const unsafeUrl = await clients.service.from("tryouts").insert({
      id: DCFC_303_TRYOUT_IDS[0],
      club_id: CLUB_IDS.alpha,
      registration_href: "javascript:alert(1)",
    });
    expectPostgrestError(
      unsafeUrl.error,
      "23514",
      "Tryouts unsafe registration URL",
    );
  });
});

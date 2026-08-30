import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

type QueryModule = typeof import("@/lib/queries");

const ALPHA_PROGRAM_ID = "99999999-9999-4999-8999-999999999941";
const BRAVO_PROGRAM_ID = "99999999-9999-4999-8999-999999999942";
const ALPHA_TRYOUT_ID = "99999999-9999-4999-8999-999999999943";
const BRAVO_TRYOUT_ID = "99999999-9999-4999-8999-999999999944";
const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalWebSocket = globalThis.WebSocket;

let clients: LocalClients;
let queries: QueryModule;
let originalProfiles: Record<string, unknown>[] = [];
let originalPages: Record<string, unknown>[] = [];

beforeAll(async () => {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
  vi.resetModules();
  queries = await import("@/lib/queries");
});

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  const profiles = await clients.service
    .from("contact_profile")
    .select("*")
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
  expect(profiles.error?.message).toBeUndefined();
  originalProfiles = profiles.data ?? [];
  const pages = await clients.service
    .from("contact_page_content")
    .select("*")
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
  expect(pages.error?.message).toBeUndefined();
  originalPages = pages.data ?? [];
});

afterEach(async () => {
  await clients.service
    .from("tryouts")
    .delete()
    .in("id", [ALPHA_TRYOUT_ID, BRAVO_TRYOUT_ID]);
  await clients.service
    .from("programs")
    .delete()
    .in("id", [ALPHA_PROGRAM_ID, BRAVO_PROGRAM_ID]);
  await clients.service
    .from("contact_profile")
    .delete()
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
  if (originalProfiles.length > 0) {
    await clients.service.from("contact_profile").insert(originalProfiles);
  }
  await clients.service
    .from("contact_page_content")
    .delete()
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
  if (originalPages.length > 0) {
    await clients.service.from("contact_page_content").insert(originalPages);
  }
});

afterAll(() => {
  globalThis.WebSocket = originalWebSocket;
  if (originalPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
  if (originalPublicAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalPublicAnonKey;
});

describe("DCFC-304 local admin-to-public acceptance", () => {
  it("publishes AAL2 Alpha edits through anonymous queries without leaking Bravo", async () => {
    const fixtures = await clients.service.from("programs").insert([
      {
        id: ALPHA_PROGRAM_ID,
        club_id: CLUB_IDS.alpha,
        slug: "dcfc-304-alpha-edit",
        nav_label: "Alpha Before",
        display_title: "Alpha Before Admin Edit",
        status: "active",
        sort_order: 91,
      },
      {
        id: BRAVO_PROGRAM_ID,
        club_id: CLUB_IDS.bravo,
        slug: "dcfc-304-bravo-isolated",
        nav_label: "Bravo Only",
        display_title: "Bravo Must Stay Isolated",
        status: "active",
        sort_order: 91,
      },
    ]);
    expect(fixtures.error?.message).toBeUndefined();

    const contacts = await clients.service.from("contact_profile").upsert([
      { club_id: CLUB_IDS.alpha, public_email: "alpha-before@example.test" },
      { club_id: CLUB_IDS.bravo, public_email: "bravo-isolated@example.test" },
    ]);
    expect(contacts.error?.message).toBeUndefined();
    const pages = await clients.service.from("contact_page_content").upsert([
      { club_id: CLUB_IDS.alpha, headline: "Alpha Before Contact Edit" },
      { club_id: CLUB_IDS.bravo, headline: "Bravo Must Stay Isolated" },
    ]);
    expect(pages.error?.message).toBeUndefined();

    const tryouts = await clients.service.from("tryouts").insert([
      {
        id: ALPHA_TRYOUT_ID,
        club_id: CLUB_IDS.alpha,
        program_id: ALPHA_PROGRAM_ID,
        status: "upcoming",
        eyebrow: "",
        headline: "Alpha Before Tryout Edit",
        intro: "",
        eligibility_copy: "",
        what_to_expect_copy: "",
        preparation_copy: "",
        event_date: null,
        location: "",
        cost_text: "",
        cta_label: "Register externally",
        registration_href: "https://alpha-registration.example.test/dcfc-304",
        closed_message: "",
        sort_order: 91,
      },
      {
        id: BRAVO_TRYOUT_ID,
        club_id: CLUB_IDS.bravo,
        program_id: BRAVO_PROGRAM_ID,
        status: "closed",
        eyebrow: "",
        headline: "Bravo Must Stay Isolated",
        intro: "",
        eligibility_copy: "",
        what_to_expect_copy: "",
        preparation_copy: "",
        event_date: null,
        location: "",
        cost_text: "",
        cta_label: "",
        registration_href: "",
        closed_message: "Bravo only",
        sort_order: 91,
      },
    ]);
    expect(tryouts.error?.message).toBeUndefined();

    const session = await createFreshLocalClient({
      email: "admin-aal2@alpha.local",
      userId: USER_IDS.adminAal2,
    });
    try {
      const programEdit = await session.client
        .from("programs")
        .update({ nav_label: "Alpha Edited", display_title: "Alpha Admin Edit Is Public" })
        .eq("id", ALPHA_PROGRAM_ID);
      expect(programEdit.error?.message).toBeUndefined();
      const contactEdit = await session.client
        .from("contact_page_content")
        .update({ headline: "Alpha Contact Admin Edit Is Public" })
        .eq("club_id", CLUB_IDS.alpha);
      expect(contactEdit.error?.message).toBeUndefined();
      const tryoutEdit = await session.client
        .from("tryouts")
        .update({ status: "open", headline: "Alpha Tryout Admin Edit Is Public" })
        .eq("id", ALPHA_TRYOUT_ID);
      expect(tryoutEdit.error?.message).toBeUndefined();

      const alphaPrograms = await queries.fetchPrograms(CLUB_IDS.alpha);
      expect(alphaPrograms.find((row) => row.id === ALPHA_PROGRAM_ID)).toMatchObject({
        navLabel: "Alpha Edited",
        displayTitle: "Alpha Admin Edit Is Public",
      });
      const alphaContact = await queries.fetchContactContent(CLUB_IDS.alpha);
      expect(alphaContact.page?.headline).toBe("Alpha Contact Admin Edit Is Public");
      const alphaTryouts = await queries.fetchTryouts(CLUB_IDS.alpha);
      expect(alphaTryouts.find((row) => row.id === ALPHA_TRYOUT_ID)).toMatchObject({
        status: "open",
        headline: "Alpha Tryout Admin Edit Is Public",
      });

      const alphaPublicPayload = JSON.stringify({
        alphaPrograms,
        alphaContact,
        alphaTryouts,
      });
      expect(alphaPublicPayload).not.toContain("Bravo Must Stay Isolated");
      await expect(queries.fetchPrograms(CLUB_IDS.bravo)).resolves.toEqual([]);
      await expect(queries.fetchContactContent(CLUB_IDS.bravo)).resolves.toEqual({
        profile: null,
        page: null,
        socialLinks: [],
      });
      await expect(queries.fetchTryouts(CLUB_IDS.bravo)).resolves.toEqual([]);

      const bravoEvidence = await clients.service
        .from("programs")
        .select("display_title")
        .eq("id", BRAVO_PROGRAM_ID)
        .single();
      expect(bravoEvidence.data?.display_title).toBe("Bravo Must Stay Isolated");
    } finally {
      await session.cleanup();
    }
  });
});

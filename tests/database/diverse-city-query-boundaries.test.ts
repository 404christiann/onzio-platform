import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { CLUB_IDS } from "../fixtures/entities";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

type QueryModule = typeof import("@/lib/queries");

const PROGRAM_ID = "44444444-4444-4444-8444-444444444401";
const HIDDEN_PROGRAM_ID = "44444444-4444-4444-8444-444444444402";
const TRYOUT_ID = "44444444-4444-4444-8444-444444444403";
const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalWebSocket = globalThis.WebSocket;

let clients: LocalClients;
let queries: QueryModule;
let originalContactProfile: Record<string, unknown> | null = null;
let originalContactPage: Record<string, unknown> | null = null;

beforeAll(async () => {
  globalThis.WebSocket =
    WebSocket as unknown as typeof globalThis.WebSocket;
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    process.env.SUPABASE_TEST_ANON_KEY;
  vi.resetModules();
  queries = await import("@/lib/queries");
});

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  const { data } = await clients.service
    .from("contact_profile")
    .select("*")
    .eq("club_id", CLUB_IDS.alpha)
    .maybeSingle();
  originalContactProfile = data;
  const { data: pageData, error: pageError } = await clients.service
    .from("contact_page_content")
    .select("*")
    .eq("club_id", CLUB_IDS.alpha)
    .maybeSingle();
  expect(pageError?.message).toBeUndefined();
  originalContactPage = pageData;
});

afterEach(async () => {
  await clients.service
    .from("tryouts")
    .delete()
    .eq("club_id", CLUB_IDS.alpha)
    .eq("id", TRYOUT_ID);
  await clients.service
    .from("programs")
    .delete()
    .eq("club_id", CLUB_IDS.alpha)
    .in("id", [PROGRAM_ID, HIDDEN_PROGRAM_ID]);
  await clients.service
    .from("contact_profile")
    .delete()
    .eq("club_id", CLUB_IDS.alpha);
  if (originalContactProfile) {
    await clients.service.from("contact_profile").insert(originalContactProfile);
  }
  await clients.service
    .from("contact_page_content")
    .delete()
    .eq("club_id", CLUB_IDS.alpha);
  if (originalContactPage) {
    await clients.service
      .from("contact_page_content")
      .insert(originalContactPage);
  }
});

afterAll(() => {
  globalThis.WebSocket = originalWebSocket;
  if (originalPublicUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
  }
  if (originalPublicAnonKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalPublicAnonKey;
  }
});

describe("DCFC-204 local public query boundary", () => {
  it("returns only the verified tenant's active Programs rows", async () => {
    const { error } = await clients.service.from("programs").insert([
      {
        id: PROGRAM_ID,
        club_id: CLUB_IDS.alpha,
        slug: "dcfc-204-active",
        display_title: "Visible Alpha Program",
        status: "active",
      },
      {
        id: HIDDEN_PROGRAM_ID,
        club_id: CLUB_IDS.alpha,
        slug: "dcfc-204-hidden",
        display_title: "Hidden Alpha Program",
        status: "hidden",
      },
    ]);
    expect(error?.message).toBeUndefined();

    const programs = await queries.fetchPrograms(CLUB_IDS.alpha);
    expect(programs.map((program) => program.id)).toContain(PROGRAM_ID);
    expect(programs.map((program) => program.id)).not.toContain(
      HIDDEN_PROGRAM_ID,
    );
    await expect(
      queries.fetchProgramBySlug(CLUB_IDS.alpha, "dcfc-204-hidden"),
    ).resolves.toBeNull();
    await expect(queries.fetchPrograms(CLUB_IDS.bravo)).resolves.toEqual([]);
  });

  it("keeps a closed Tryout on the validated tenant Contact fallback", async () => {
    const contact = await clients.service.from("contact_profile").upsert({
      club_id: CLUB_IDS.alpha,
      public_email: "tryouts-contract@example.test",
    });
    expect(contact.error?.message).toBeUndefined();

    const tryout = await clients.service.from("tryouts").insert({
      id: TRYOUT_ID,
      club_id: CLUB_IDS.alpha,
      status: "closed",
      cta_label: "Register",
      registration_href: "https://registration.example.test/closed",
      closed_message: "Registration is closed.",
    });
    expect(tryout.error?.message).toBeUndefined();

    const rows = await queries.fetchTryouts(CLUB_IDS.alpha);
    expect(rows.find((row) => row.id === TRYOUT_ID)?.action).toEqual({
      kind: "contact",
      label: "Contact the club",
      href: "mailto:tryouts-contract@example.test",
    });
  });

  it("returns the tenant's canonical Contact profile and page content", async () => {
    const profile = await clients.service.from("contact_profile").upsert({
      club_id: CLUB_IDS.alpha,
      public_email: "contact-contract@example.test",
      public_phone: "+1 555 0100",
      service_area: "Schaumburg, Illinois",
    });
    expect(profile.error?.message).toBeUndefined();
    const page = await clients.service.from("contact_page_content").upsert({
      club_id: CLUB_IDS.alpha,
      eyebrow: "Contact",
      headline: "Start a conversation.",
      intro: "Reach the club directly.",
    });
    expect(page.error?.message).toBeUndefined();

    await expect(queries.fetchContactContent(CLUB_IDS.alpha)).resolves.toMatchObject({
      profile: {
        publicEmail: "contact-contract@example.test",
        publicPhone: "+1 555 0100",
        serviceArea: "Schaumburg, Illinois",
      },
      page: {
        eyebrow: "Contact",
        headline: "Start a conversation.",
      },
    });
  });
});
